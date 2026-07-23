use std::sync::Arc;
use tokio::io::{self, AsyncBufReadExt, AsyncReadExt, BufReader};

use crate::twitch_bot::{TwitchBot, TwitchCommand};
use axum::response::sse::Event;
use headers::Server;
use serde_json::json;
use tokio::sync::{Mutex, mpsc};
use wgpu::PolygonMode::Line;
use winit::event;

use crossterm::event::{EventStream, KeyCode, KeyEventKind};
use crossterm::terminal;
use futures_util::StreamExt;

use crate::music_server::MusicCommand;
use crate::{AppDatabase, MusicAuth, TwitchAuth};
use crate::{
    graphic_server::{self, GraphicServer, GraphicServerSender},
    music_server::{self, MusicCommandSender, MusicEventReceiver, MusicServer},
    twitch_bot::{self, TwitchCommandSender, TwitchEventReceiver},
};

pub struct Mediator {
    music_event_receiver: Option<MusicEventReceiver>,
    music_command_sender: Option<MusicCommandSender>,
    music_handle: Option<tokio::task::JoinHandle<()>>,
    graphic_sender: Option<GraphicServerSender>,
    graphic_handle: Option<tokio::task::JoinHandle<()>>,
    twitch_event_receiver: Option<TwitchEventReceiver>,
    twitch_command_sender: Option<TwitchCommandSender>,
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
            music_event_receiver: Some(music_event_receiver),
            music_command_sender: Some(music_command_sender),
            music_handle: Some(music_handle),
            graphic_sender: Some(graphic_sender),
            graphic_handle: Some(graphic_handle),
            twitch_event_receiver: Some(twitch_event_receiver),
            twitch_command_sender: Some(twitch_command_sender),
            twitch_bot_handle: Some(twitch_bot_handle),
            app_database,
        }
    }

    pub async fn run(&mut self) {
        // here i run every single server after they are all set up well and finely!

        let mut track_info = ServerEvent::UpdateTrack {
            track_name: "blank".to_string(),
            album_name: "blank".to_string(),
            artist_name: "blank".to_string(),
            track_length_millis: 0,
            cover_art_url: "blank".to_string(),
        };
        let currently_playing_track_id = Arc::new(Mutex::new("".to_owned()));
        let last_playing_track_id = Arc::new(Mutex::new("".to_owned()));

        let mut music_command_sender = self.music_command_sender.take().unwrap();
        let mut music_event_receiver = self.music_event_receiver.take().unwrap();
        let mut twitch_command_sender = self.twitch_command_sender.take().unwrap();
        let mut twitch_event_receiver = self.twitch_event_receiver.take().unwrap();

        let graphic_sender = self.graphic_sender.take().unwrap();

        tokio::join!(
            async {
                /*let mut reader = EventStream::new();
                terminal::enable_raw_mode().ok();

                while let Some(Ok(event)) = reader.next().await {
                    if let crossterm::event::Event::Key(key_event) = event {
                        if key_event.kind == KeyEventKind::Press {
                            match key_event.code {
                                KeyCode::Char('s') => {
                                    let _ = music_command_sender.try_send(MusicCommand::Skip);
                                }
                                KeyCode::Char('p') => {
                                    let _ = music_command_sender.try_send(MusicCommand::Toggle);
                                }
                                KeyCode::Char('q') => {
                                    println!("\r\nQuitting...");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }*/
                //would be cool to have the terminal raw mode thing
                let mut lines = BufReader::new(io::stdin()).lines();

                while let Ok(Some(line)) = lines.next_line().await {
                    match line.trim() {
                        "s" => {
                            let _ = music_command_sender.try_send(MusicCommand::Skip);
                        }
                        "p" => {
                            let _ = music_command_sender.try_send(MusicCommand::Toggle);
                        }
                        "q" => {
                            println!("Quitting...");
                            break;
                        }
                        _ => {}
                    }
                }
            },
            async {
                let cptid_clone = currently_playing_track_id.clone();
                while let Some(event) = twitch_event_receiver.recv().await {
                    match event {
                        twitch_bot::TwitchEvent::LikeTrack { privmsg } => {
                            let user_id = privmsg.sender.id.clone();
                            let track_id = {
                                let guard = cptid_clone.lock().await;
                                guard.clone()
                            };
                            /*
                            let exists: i64 =
                                self.app_database.get_likes_count(track_id.as_str()).await;

                            if exists == 0 {
                                self.app_database
                                    .add_like(track_id.as_str(), user_id.as_str())
                                    .await;
                                println!("User {} liked track {}", user_id, track_id);
                                let _ = twitch_command_sender.try_send(
                                    TwitchCommand::SendMessageReply {
                                        privmsg,
                                        msg: "[BOT] liked!".to_owned(),
                                    },
                                );
                                let amount: i64 =
                                    self.app_database.get_likes_count(track_id.as_str()).await;
                                println!("send likes update!!!! : {}", amount);
                                let update_likes = ServerEvent::UpdateLikes {
                                    amount,
                                    new_like: false,
                                };
                                let _ = graphic_sender.send_event(update_likes.to_sse_event());
                            } else {
                                println!("User {} already liked track {}", user_id, track_id);
                                let _ = twitch_command_sender.try_send(
                                    TwitchCommand::SendMessageReply {
                                        privmsg,
                                        msg: "[BOT] you already liked that!".to_owned(),
                                    },
                                );
                            }*/

                            match self
                                .app_database
                                .add_like(track_id.as_str(), user_id.as_str())
                                .await
                            {
                                Ok(true) => {
                                    let _ = twitch_command_sender.try_send(
                                        TwitchCommand::SendMessageReply {
                                            privmsg,
                                            msg: "[BOT] liked".to_owned(),
                                        },
                                    );
                                    let amount: i64 =
                                        self.app_database.get_likes_count(track_id.as_str()).await;
                                    println!("send likes update!!!! : {}", amount);
                                    let update_likes = ServerEvent::UpdateLikes {
                                        amount,
                                        new_like: false,
                                    };
                                    let _ = graphic_sender.send_event(update_likes.to_sse_event());
                                }
                                Ok(false) => {
                                    let _ = twitch_command_sender.try_send(
                                        TwitchCommand::SendMessageReply {
                                            privmsg,
                                            msg: "[BOT] you already liked that!".to_owned(),
                                        },
                                    );
                                }

                                Err(e) => {
                                    let _ = twitch_command_sender.try_send(
                                        TwitchCommand::SendMessageReply {
                                            privmsg,
                                            msg: "[BOT] error adding like!".to_owned(),
                                        },
                                    );
                                }
                            }
                        }
                    }
                }
            },
            async {
                let cptid_clone = currently_playing_track_id.clone();
                let lptid_clone = last_playing_track_id.clone();

                loop {
                    while let Some(music_event) = music_event_receiver.recv().await {
                        match music_event {
                            music_server::MusicEvent::TrackProgress {
                                track_length_millis,
                                time_elapsed_millis,
                            } => {
                                let update_seekbar = ServerEvent::UpdateSeekBar {
                                    track_length_millis: track_length_millis,
                                    time_elapsed_millis: time_elapsed_millis,
                                };
                                let _ = graphic_sender.send_event(update_seekbar.to_sse_event());
                            }
                            music_server::MusicEvent::TrackInfo {
                                track_id,
                                name,
                                album_name,
                                artist_name,
                                cover_art_url,
                                track_length_millis,
                            } => {
                                *currently_playing_track_id.lock().await = track_id;
                                track_info = ServerEvent::UpdateTrack {
                                    track_name: name,
                                    album_name,
                                    artist_name,
                                    track_length_millis,
                                    cover_art_url,
                                };
                            }
                        }

                        // TODO make this cleaner!
                        let cptid_guard = cptid_clone.lock().await;
                        let lptid_guard = lptid_clone.lock().await;
                        if *cptid_guard != *lptid_guard {
                            drop(cptid_guard);
                            drop(lptid_guard);

                            // bestiaccia
                            let mut last_guard = lptid_clone.lock().await;
                            *last_guard = cptid_clone.lock().await.clone();
                            drop(last_guard);

                            let current_id = cptid_clone.lock().await.clone();
                            let amount: i64 =
                                self.app_database.get_likes_count(current_id.as_str()).await;
                            println!("send likes update!!!! : {}", amount);
                            let update_likes = ServerEvent::UpdateLikes {
                                amount,
                                new_like: false,
                            };
                            let _ = graphic_sender.send_event(update_likes.to_sse_event());
                        }
                        let _ = graphic_sender.send_event(track_info.to_sse_event());
                    }
                }
            }
        );
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
