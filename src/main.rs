use async_trait::async_trait;
use dotenvy::dotenv;
use sqlite::{Connection, State};
use std::fmt::Debug;
use std::{env, sync::Arc};
use twitch_irc::login::{
    RefreshingLoginCredentials, StaticLoginCredentials, TokenStorage, UserAccessToken,
};
use twitch_irc::{ClientConfig, SecureTCPTransport, TwitchIRCClient};

use crate::mediator::Mediator;
use crate::twitch_bot::TwitchAuth;
use chrono::{DateTime, Utc};
mod graphic_server;
mod mediator;
mod music_server;
mod twitch_bot;

#[tokio::main]
async fn main() {
    dotenv().ok();

    let mut app_database = AppDatabase::new("data.db");
    app_database.check_token().await;

    let music_auth = MusicAuth {
        api_url: env::var("MUSIC_API_URL").expect("MUSIC_API_URL must be set"),
        username: env::var("USERNAME").expect("USERNAME must be set"),
        password: env::var("PASSWORD").expect("PASSWORD must be set"),
    };

    let twitch_auth = TwitchAuth {
        client_id: env::var("TWITCH_CLIENT_ID").expect("MUSIC_API_URL must be set"),
        client_secret: env::var("TWITCH_CLIENT_SECRET").expect("MUSIC_API_URL must be set"),
    };

    let mut mediator = Mediator::new(music_auth, twitch_auth, app_database);
    mediator.run().await;
}

struct MusicAuth {
    api_url: String,
    username: String,
    password: String,
}

struct AppDatabase {
    connection: Arc<tokio::sync::Mutex<Connection>>,
}

// damn i need clone because the credentials thing for some reason REALLY wants its own AppDatabase
impl Clone for AppDatabase {
    fn clone(&self) -> Self {
        AppDatabase {
            connection: Arc::clone(&self.connection),
        }
    }
}

impl AppDatabase {
    pub fn new<T>(path: T) -> Self
    where
        T: AsRef<std::path::Path>,
    {
        let connection = sqlite::open(path).unwrap();

        //check if it's empty lol
        let mut count = 0;
        {
            let query = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
            let mut statement = connection.prepare(query).unwrap();
            if let Ok(State::Row) = statement.next() {
                count = statement.read::<i64, _>(0).unwrap();
            }
        }
        //if empty recreate schema
        if count == 0 {
            let settings_table_query = "CREATE TABLE IF NOT EXISTS SETTINGS (
                key TEXT PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );";
            let tracks_table_query = "CREATE TABLE IF NOT EXISTS TRACKS (
                key TEXT PRIMARY KEY,
                track_name TEXT,
                artist_name TEXT,
                album_name TEXT

            );";
            let users_table_query = "CREATE TABLE IF NOT EXISTS USERS (
                username_hash TEXT PRIMARY KEY
            );"; // TODO should i also store the usernames? idk, might fuck up with privacy, it would be a good idea to make the users accept privacy terms with !privacy
            let likes_table_query = "CREATE TABLE IF NOT EXISTS LIKES (
                track TEXT,
                user TEXT,
                FOREIGN KEY (track) REFERENCES TRACKS(key),
                FOREIGN KEY (user) REFERENCES USERS(username_hash),
                PRIMARY KEY (track, user)

            );";

            connection.execute(settings_table_query);
            connection.execute(tracks_table_query);
            connection.execute(users_table_query);
            connection.execute(likes_table_query);
        }

        Self {
            connection: Arc::new(tokio::sync::Mutex::new(connection)),
        }
    }

    async fn get_first_token(&self) -> Result<UserAccessToken, TokenError> {
        let client_id = env::var("TWITCH_CLIENT_ID").expect("TWITCH_CLIENT_ID must be set");
        let client_secret =
            env::var("TWITCH_CLIENT_SECRET").expect("TWITCH_CLIENT_SECRET must be set");
        let auth_url = format!(
            "https://id.twitch.tv/oauth2/authorize?\
             response_type=code&\
             client_id={}&\
             redirect_uri=http://localhost:3000&\
             scope=chat:read+chat:edit+channel:moderate&\
             state=random_state_string",
            client_id
        );
        println!("1. Open this URL in your browser:");
        println!("{}", auth_url);
        println!("\n2. Authorize the app and you'll be redirected to a URL like:");
        println!("   http://localhost:3000/?code=YOUR_CODE&state=...");
        println!("\n3. Copy the 'code' parameter from the URL and paste it here:");

        let mut code = String::new();
        std::io::stdin()
            .read_line(&mut code)
            .expect("Failed to read line");
        let code = code.trim();

        let client = reqwest::Client::new();
        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", "http://localhost:3000"),
        ];

        let response = client
            .post("https://id.twitch.tv/oauth2/token")
            .form(&params)
            .send()
            .await
            .expect("Failed to send request");

        let token_response: serde_json::Value =
            response.json().await.expect("Failed to parse response");

        let token = UserAccessToken {
            access_token: token_response["access_token"].as_str().unwrap().to_string(),
            refresh_token: token_response["refresh_token"]
                .as_str()
                .unwrap()
                .to_string(),

            created_at: Utc::now(),
            expires_at: Some(
                Utc::now()
                    + chrono::Duration::seconds(
                        token_response["expires_in"].as_i64().unwrap_or(3600),
                    ),
            ),
        };
        Ok(token)
    }

    pub async fn check_token(&mut self) {
        let res = self.load_token().await;
        println!("are we loaded?");

        match res {
            Err(TokenError::NoTokenFound) => {
                println!("but was the error no token found?");
                let token_res = self.get_first_token().await;
                match token_res {
                    Ok(token) => {
                        println!("are we updooting?");
                        self.update_token(&token).await;
                    }
                    Err(_) => todo!(),
                }
            }
            _ => {}
        }
    }

    async fn get_likes_count(&self, track_id: &str) -> i64 {
        let conn = self.connection.lock().await;
        let query = "SELECT COUNT(*) FROM LIKES WHERE track = ?";
        let mut stmt = conn.prepare(query).unwrap();
        stmt.bind((1, track_id)).unwrap();
        match stmt.next().unwrap() {
            sqlite::State::Row => stmt.read::<i64, _>(0).unwrap(),
            sqlite::State::Done => 0,
        }
    }

    async fn add_like(&self, track_id: &str, user_id: &str) -> Result<bool, sqlite::Error> {
        let conn = self.connection.lock().await;
        // Check if exists
        let check = "SELECT COUNT(*) FROM LIKES WHERE track = ? AND user = ?";
        let mut stmt = conn.prepare(check).unwrap();
        stmt.bind((1, track_id)).unwrap();
        stmt.bind((2, user_id)).unwrap();

        let exists: i64 = match stmt.next().unwrap() {
            sqlite::State::Row => stmt.read::<i64, _>(0).unwrap(),
            sqlite::State::Done => 0,
        };

        if exists > 0 {
            return Ok(false); // Already liked
        }

        let insert = "INSERT INTO LIKES (track, user) VALUES (?, ?)";
        let mut stmt = conn.prepare(insert).unwrap();
        stmt.bind((1, track_id)).unwrap();
        stmt.bind((2, user_id)).unwrap();
        stmt.next().unwrap();
        Ok(true)
    }
}

impl Debug for AppDatabase {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppDatabase")
            .field("connection", &"<sqlite connection>")
            .finish()
    }
}
#[derive(Debug)]
pub enum TokenError {
    NoTokenFound,
    DatabaseError,
    SerializationError(serde_json::Error),
}

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TokenError::NoTokenFound => write!(f, "No token found in database"),
            TokenError::DatabaseError => write!(f, "Database error"),
            TokenError::SerializationError(e) => write!(f, "Serialization error: {}", e),
        }
    }
}

#[async_trait]
impl TokenStorage for AppDatabase {
    type LoadError = TokenError; // or some other error
    type UpdateError = TokenError;
    async fn load_token(&mut self) -> Result<UserAccessToken, Self::LoadError> {
        let conn = self.connection.lock().await;
        let mut statement = conn
            .prepare("SELECT value FROM SETTINGS WHERE key = 'twitch_token'")
            .map_err(|_| TokenError::NoTokenFound)?;
        println!("loading the token");

        match statement.next() {
            Ok(State::Row) => {
                let token_json: String =
                    statement.read(0).map_err(|_| TokenError::DatabaseError)?;

                let token: UserAccessToken = serde_json::from_str(&token_json)
                    .map_err(|e| TokenError::SerializationError(e))?;
                println!("the token is okay");
                Ok(token)
            }
            Ok(State::Done) => Err(TokenError::NoTokenFound),
            Err(_) => Err(TokenError::DatabaseError),
        }
    }

    async fn update_token(&mut self, token: &UserAccessToken) -> Result<(), Self::UpdateError> {
        let conn = self.connection.lock().await;
        let token_json =
            serde_json::to_string(token).map_err(|e| TokenError::SerializationError(e))?;
        println!("update the token ");

        let mut stmt = conn
            .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('twitch_token', ?)")
            .map_err(|_| TokenError::DatabaseError)?;

        stmt.bind((1, token_json.as_str()))
            .map_err(|_| TokenError::DatabaseError)?;

        stmt.next().map_err(|_| TokenError::DatabaseError)?;

        Ok(())
    }
}
