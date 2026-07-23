use std::sync::Arc;
use std::time::Duration;

use dotenvy::dotenv;
use opensubsonic::{Auth, Client};
use rodio::source::Source;
use rodio::{Decoder, DeviceSinkBuilder, Player};
use std::io::Cursor;
use tokio::sync::{Mutex, mpsc};

use crate::MusicAuth; // Use mpsc instead of broadcast // Add this import

pub struct MusicEventReceiver {
    event_rx: mpsc::Receiver<MusicEvent>,
}

pub struct MusicCommandSender {
    command_tx: mpsc::Sender<MusicCommand>,
}

pub struct MusicServer {
    client: Client,
    event_tx: mpsc::Sender<MusicEvent>,
    command_rx: Arc<Mutex<mpsc::Receiver<MusicCommand>>>,
}

impl MusicServer {
    pub fn new(music_auth: MusicAuth) -> (Self, MusicEventReceiver, MusicCommandSender) {
        dotenv().ok();

        let (event_tx, event_rx) = mpsc::channel(100);
        let (command_tx, command_rx) = mpsc::channel(100);

        // Read environment variables
        let api_url = music_auth.api_url;
        let username = music_auth.username;
        let password = music_auth.password;
        let client_res = Client::new(&api_url, Auth::token(&username, &password));
        let music_server = Self {
            client: client_res.unwrap(),
            event_tx,
            command_rx: Arc::new(Mutex::new(command_rx)),
        };
        let music_event_receiver = MusicEventReceiver { event_rx };
        let music_command_sender = MusicCommandSender { command_tx };
        (music_server, music_event_receiver, music_command_sender)
    }

    pub async fn run(&self) {
        match self.client.ping().await {
            Ok(response) => {
                // Handle success
            }
            Err(e) => {
                panic!("Failed to connect to music server: {}", e);
            }
        }
        println!("Connected to music server! :D");

        let playlist_id = "BOoaoyKinoDvFomNE7iMHB";
        let mut playlist = self.client.get_playlist(playlist_id).await.unwrap();
        let stream_handle = DeviceSinkBuilder::open_default_sink().unwrap();

        // shuffle...?
        shuffle_simple(&mut playlist.entry);
        for track in playlist.entry {
            if let Ok(stream_data) = self
                .client
                .stream(&track.id.to_string(), None, None, None, None)
                .await
            {
                let cursor = Cursor::new(stream_data.to_vec());

                let source = Decoder::new(cursor).unwrap();

                let total_duration = source.total_duration();

                let track_length_millis = total_duration.map(|d| d.as_millis()).unwrap_or(
                    track
                        .duration
                        .map(|secs| (secs as u128) * 1000)
                        .unwrap_or(0),
                );

                let cover_art_url = if let Some(cover_art_id) = &track.cover_art {
                    self.client
                        .cover_art_url(cover_art_id, Some(100))
                        .ok()
                        .map(|url| url.to_string())
                } else {
                    None // TODO unimplemented, give a default url
                };

                let event_tx = self.event_tx.clone();
                let track_id = track.id.clone();

                let update_track_event = MusicEvent::TrackInfo {
                    track_id: track_id.clone(),
                    name: track.title,
                    album_name: track.album.unwrap(),
                    artist_name: track.artist.unwrap(),
                    cover_art_url: cover_art_url.unwrap(),
                    track_length_millis: track_length_millis,
                };

                let _ = event_tx.send(update_track_event).await;
                let command_rx = self.command_rx.clone();

                let player = Player::connect_new(stream_handle.mixer());
                player.append(source);

                let _ = tokio::spawn(async move {
                    let mut last_position = 0;
                    let mut interval = tokio::time::interval(Duration::from_millis(100));
                    loop {
                        interval.tick().await;
                        let mut rx = command_rx.lock().await;
                        while let Ok(cmd) = rx.try_recv() {
                            // Handle all pending commands
                            match cmd {
                                MusicCommand::Toggle => {
                                    if player.is_paused() {
                                        player.play();
                                    } else {
                                        player.pause();
                                    }
                                }
                                MusicCommand::Skip => {
                                    player.clear();
                                }
                            }
                        }

                        if player.empty() {
                            println!("Track finished: {}", track_id);
                            break;
                        }

                        let current_pos = player.get_pos().as_millis();

                        if current_pos != last_position {
                            last_position = current_pos;

                            // Send progress update TODO is this a good thing to do? convert and send f32?
                            let progress_event = MusicEvent::TrackProgress {
                                track_length_millis: track_length_millis,
                                time_elapsed_millis: current_pos,
                            };

                            let _ = event_tx.send(progress_event).await;
                        }
                    }
                })
                .await;
            }
        }
    }
}

impl MusicEventReceiver {
    pub fn try_recv(&mut self) -> Result<MusicEvent, mpsc::error::TryRecvError> {
        self.event_rx.try_recv()
    }
    pub async fn recv(&mut self) -> Option<MusicEvent> {
        self.event_rx.recv().await
    }
}

impl MusicCommandSender {
    pub fn try_send(
        &mut self,
        command: MusicCommand,
    ) -> Result<(), mpsc::error::TrySendError<MusicCommand>> {
        self.command_tx.try_send(command)
    }
}

pub enum MusicEvent {
    TrackProgress {
        track_length_millis: u128,
        time_elapsed_millis: u128,
    },
    TrackInfo {
        track_id: String,
        name: String,
        album_name: String,
        artist_name: String,
        cover_art_url: String,
        track_length_millis: u128,
    },
}

pub enum MusicCommand {
    Skip,
    Toggle,
}

// ill be real i got this from deepseek i am tired
fn shuffle_simple<T>(vec: &mut Vec<T>) {
    use std::time::{SystemTime, UNIX_EPOCH};

    // Get a simple seed from the current time
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_micros() as usize;

    // Super simple Fisher-Yates
    for i in (1..vec.len()).rev() {
        let j = (seed + i) % (i + 1); // Just use seed + index as a "random" number
        vec.swap(i, j);
    }
}
