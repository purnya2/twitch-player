use crate::twitch_bot::{TwitchBot, TwitchCommand};
use axum::response::sse::Event;
use headers::Server;
use serde_json::json;
use tokio::io::{self, AsyncReadExt};
use tokio::sync::mpsc;
use winit::event;

use crate::music_server::MusicCommand;
use crate::{AppDatabase, MusicAuth, TwitchAuth};
use crate::{
    graphic_server::{self, GraphicServer, GraphicServerSender},
    music_server::{self, MusicCommandSender, MusicEventReceiver, MusicServer},
    twitch_bot::{self, TwitchCommandSender, TwitchEventReceiver},
};

pub struct Mediator {
    music_event_receiver: MusicEventReceiver,
    music_command_sender: MusicCommandSender,
    music_handle: Option<tokio::task::JoinHandle<()>>,

    // the graphic server thingies, these are useful for running AND interacting with the interface
    graphic_sender: GraphicServerSender, // this is quite curious ! I need to separate the graphic server into server and sender in order to be able to send data without having ownership problems, this is much cleaner...
    graphic_handle: Option<tokio::task::JoinHandle<()>>,
    twitch_event_receiver: TwitchEventReceiver,
    twitch_command_sender: TwitchCommandSender,
    twitch_bot_handle: Option<tokio::task::JoinHandle<()>>,
    app_database: AppDatabase,
}

impl Mediator {
    pub fn new(music_auth: MusicAuth, twitch_auth: TwitchAuth, app_database: AppDatabase) -> Self {
        let (graphic_server, graphic_sender) = GraphicServer::new();

        let (music_server, music_event_receiver, music_command_sender) =
            MusicServer::new(music_auth);

        let (twitch_bot, twitch_event_receiver, twitch_command_sender) =
            TwitchBot::new(twitch_auth, app_database.clone());

        let music_handle = tokio::spawn(async move { music_server.run().await });
        let graphic_handle = tokio::spawn(async move { graphic_server.run().await });
        let twitch_bot_handle = tokio::spawn(async move { twitch_bot.run().await });
        Self {
            music_event_receiver,
            music_command_sender,
            music_handle: Some(music_handle),
            graphic_sender,
            graphic_handle: Some(graphic_handle),
            twitch_event_receiver,
            twitch_command_sender,
            twitch_bot_handle: Some(twitch_bot_handle),
            app_database,
        }
    }

    pub async fn run(&mut self) {
        // here i run every single server after they are all set up well and finely!
        let db_m = self.app_database.connection.clone();
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(100));

        const MAX_EVENTS_PER_BATCH: usize = 10;

        let mut track_info = ServerEvent::UpdateTrack {
            track_name: "blank".to_string(),
            album_name: "blank".to_string(),
            artist_name: "blank".to_string(),
            track_length_millis: 0,
            cover_art_url: "blank".to_string(),
        };
        let mut currently_playing_track_id = "".to_owned();
        let mut last_playing_track_id = "".to_owned();

        // hereby i will send to the graphic server UpdateSeekBar server events with the seekbar pos pingponging between 0 and 1
        let mut stdin = io::stdin();
        let mut buf = [0u8; 1];
        loop {
            let mut processed = 0;
            // some bullshit that checks if i send some commands in stdin, this is... horrible to say the least
            match tokio::time::timeout(tokio::time::Duration::from_millis(0), stdin.read(&mut buf))
                .await
            {
                Ok(Ok(1)) => {
                    let c = buf[0] as char;
                    if c == 's' {
                        self.music_command_sender.try_send(MusicCommand::Skip);
                    }
                    if c == 'p' {
                        self.music_command_sender.try_send(MusicCommand::Toggle);
                    }
                    if c == 'q' {
                        println!("Quitting...");
                        break;
                    }
                }
                _ => {}
            }

            // Twitch Bot
            match self.twitch_event_receiver.try_recv() {
                Ok(event) => match event {
                    twitch_bot::TwitchEvent::LikeTrack { privmsg } => {
                        let user_id = privmsg.sender.id.clone();
                        let track_id = currently_playing_track_id.clone();
                        let exists: i64 =
                            self.app_database.get_likes_count(track_id.as_str()).await;

                        if exists == 0 {
                            self.app_database
                                .add_like(track_id.as_str(), user_id.as_str())
                                .await;
                            println!("User {} liked track {}", user_id, track_id);
                            let _ = self.twitch_command_sender.try_send(
                                TwitchCommand::SendMessageReply {
                                    privmsg,
                                    msg: "[BOT] liked!".to_owned(),
                                },
                            );
                            self.send_likes_update(track_id.clone(), false).await;
                        } else {
                            println!("User {} already liked track {}", user_id, track_id);
                            let _ = self.twitch_command_sender.try_send(
                                TwitchCommand::SendMessageReply {
                                    privmsg,
                                    msg: "[BOT] you already liked that!".to_owned(),
                                },
                            );
                        }
                    }
                },
                Err(_) => {}
            }

            // Music server
            loop {
                if processed > MAX_EVENTS_PER_BATCH {
                    break;
                }

                match self.music_event_receiver.try_recv() {
                    Ok(music_event) => {
                        match music_event {
                            music_server::MusicEvent::TrackProgress {
                                track_length_millis,
                                time_elapsed_millis,
                            } => self.send_seekbar_update(track_length_millis, time_elapsed_millis),
                            music_server::MusicEvent::TrackInfo {
                                track_id,
                                name,
                                album_name,
                                artist_name,
                                cover_art_url,
                                track_length_millis,
                            } => {
                                currently_playing_track_id = track_id;
                                track_info = ServerEvent::UpdateTrack {
                                    track_name: name,
                                    album_name,
                                    artist_name,
                                    track_length_millis,
                                    cover_art_url,
                                };
                            }
                        }
                        processed += 1;
                    }
                    Err(mpsc::error::TryRecvError::Empty) => break,
                    Err(mpsc::error::TryRecvError::Disconnected) => return,
                }

                if currently_playing_track_id != last_playing_track_id {
                    last_playing_track_id = currently_playing_track_id.clone();

                    self.send_likes_update(currently_playing_track_id.clone(), false)
                        .await;
                }
            }
            let _ = self.graphic_sender.send_event(track_info.to_sse_event());

            // mhh little doubt, is it a good idea to do this lol, to send so often the track info..? TODO
            interval.tick().await;
        }
    }

    async fn send_likes_update(&mut self, track_id: String, new_like: bool) {
        let amount: i64 = self.app_database.get_likes_count(track_id.as_str()).await;
        println!("send likes update!!!! : {}", amount);

        let update_likes = ServerEvent::UpdateLikes { amount, new_like };
        let _ = self.graphic_sender.send_event(update_likes.to_sse_event());
    }

    fn send_seekbar_update(&mut self, track_length_millis: u128, time_elapsed_millis: u128) {
        let update_seekbar = ServerEvent::UpdateSeekBar {
            track_length_millis: track_length_millis,
            time_elapsed_millis: time_elapsed_millis,
        };
        let _ = self
            .graphic_sender
            .send_event(update_seekbar.to_sse_event());
    }
}

// here we put all of the events that should be sent to the graphic server,
// since it's the mediator that processes all the necessary info i thought it would be fit if
// the enums were defined here!
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum ServerEvent {
    UpdateSeekBar {
        track_length_millis: u128,
        time_elapsed_millis: u128,
    },
    UpdateTrack {
        track_name: String,
        album_name: String,
        artist_name: String,
        track_length_millis: u128,
        cover_art_url: String,
    },
    UpdateLikes {
        amount: i64,
        new_like: bool,
    },
    SendMessage {
        msg: String,
    },
}

impl ServerEvent {
    pub fn to_sse_event(&self) -> Event {
        match self {
            ServerEvent::UpdateSeekBar {
                track_length_millis,
                time_elapsed_millis,
            } => Event::default().data(
                serde_json::to_string(&json!({
                    "track_length_millis": track_length_millis,
                    "time_elapsed_millis": time_elapsed_millis,
                }))
                .unwrap(),
            ),
            ServerEvent::UpdateTrack {
                artist_name,
                album_name,
                cover_art_url,
                track_length_millis,
                track_name,
            } => Event::default().data(
                serde_json::to_string(&json!({
                    "track_name": track_name,
                    "album_name": album_name,
                    "artist_name": artist_name,
                    "cover_art_url": cover_art_url,
                    "track_length_millis": track_length_millis,


                }))
                .unwrap(),
            ),
            ServerEvent::UpdateLikes { amount, new_like } => Event::default().data(
                serde_json::to_string(&json!({
                    "likesAmount": amount,
                    "isNewLike": new_like
                }))
                .unwrap(),
            ),
            ServerEvent::SendMessage { msg } => todo!(),
        }
    }
}
