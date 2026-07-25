use std::sync::Arc;

use dotenvy::dotenv;
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::sync::{Mutex, mpsc};
use twitch_irc::login::{RefreshingLoginCredentials, TokenStorage, UserAccessToken};
use twitch_irc::message::{PrivmsgMessage, ServerMessage};
use twitch_irc::{ClientConfig, SecureTCPTransport, TwitchIRCClient};

macro_rules! send {
    ($tx:expr, $event:expr) => {
        let _ = $tx.send($event).await;
    };
}

use crate::AppDatabase;

pub struct TwitchAuth {
    pub client_id: String,
    pub client_secret: String,
}

pub struct TwitchEventReceiver {
    event_rx: mpsc::Receiver<TwitchEvent>,
}

#[derive(Clone)]
pub struct TwitchCommandSender {
    command_tx: mpsc::Sender<TwitchCommand>,
}

pub struct TwitchBot {
    channel: String,
    message_receiver: UnboundedReceiver<ServerMessage>,
    client: TwitchIRCClient<SecureTCPTransport, RefreshingLoginCredentials<AppDatabase>>,
    event_tx: mpsc::Sender<TwitchEvent>,
    command_rx: Arc<Mutex<mpsc::Receiver<TwitchCommand>>>,
}

impl TwitchBot {
    pub fn new(
        twitch_auth: TwitchAuth,
        app_database: AppDatabase,
    ) -> (Self, TwitchEventReceiver, TwitchCommandSender) {
        dotenv().ok();
        let credentials = RefreshingLoginCredentials::init(
            twitch_auth.client_id.clone(),
            twitch_auth.client_secret.clone(),
            app_database,
        );

        let config = ClientConfig::new_simple(credentials);
        let (message_receiver, client) = TwitchIRCClient::<
            SecureTCPTransport,
            RefreshingLoginCredentials<AppDatabase>,
        >::new(config);

        let (event_tx, event_rx) = mpsc::channel(100);
        let (command_tx, command_rx) = mpsc::channel(100);

        let twitch_bot = Self {
            channel: "purnyameow".to_owned(),
            message_receiver,
            client,
            event_tx,
            command_rx: Arc::new(Mutex::new(command_rx)),
        };
        let twitch_event_receiver = TwitchEventReceiver { event_rx };
        let twitch_command_sender = TwitchCommandSender { command_tx };

        (twitch_bot, twitch_event_receiver, twitch_command_sender)
    }

    pub async fn run(mut self) {
        let channel = self.channel.clone();
        match self.client.join(channel.clone()) {
            Ok(()) => println!("Successfully joined on twitch channel : #{}", channel),
            Err(e) => {
                println!("❌ Failed to join #{}: {:?}", channel, e);
                // Try to see if we're getting any messages
                println!("Waiting for messages...");
            }
        }
        self.client
            .say(channel.clone(), "[ °□°]/!! ahoy! Im the bot!".to_owned())
            .await
            .unwrap();
        let event_tx = self.event_tx.clone();
        let command_rx_m = self.command_rx.clone();
        let message_handle = tokio::spawn(async move {
            while let Some(message) = self.message_receiver.recv().await {
                //println!("Received message: {:?}", message);
                match message {
                    ServerMessage::Privmsg(privmsg) => match privmsg.message_text.as_str() {
                        "!like" => {
                            send!(event_tx, TwitchEvent::LikeTrack { privmsg });
                        }
                        "!piastrato" => {
                            let username = privmsg.sender.name.clone();
                            let msg = format!("[ °□°]/!! {} e' stato piastrato!", username);

                            send!(event_tx, TwitchEvent::reply(privmsg, msg));
                        }
                        "non lo voglio piastrato" => {
                            send!(
                                event_tx,
                                TwitchEvent::reply(
                                    privmsg,
                                    "[ °□°]/!! eh mah che po tegwadatacologodog wapa go"
                                )
                            );
                        }
                        "!aaa" => {
                            send!(event_tx, TwitchEvent::message("[ °□°]/!! AAAAAAAAAAAA"));
                        }

                        _ => {}
                    },
                    _ => {}
                }
            }
        });

        let command_handle = tokio::spawn(async move {
            loop {
                let mut command_rx = command_rx_m.lock().await;
                match command_rx.try_recv() {
                    Ok(command) => match command {
                        TwitchCommand::SendMessage { msg } => {
                            let _ = self.client.say(channel.clone(), msg).await;
                        }
                        TwitchCommand::SendMessageReply { privmsg, msg } => {
                            let _ = self.client.say_in_reply_to(&privmsg, msg).await;
                        }
                    },
                    Err(_) => {
                        drop(command_rx);
                        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
                    }
                }
            }
        });

        let _ = tokio::join!(message_handle, command_handle);
    }
}

impl TwitchEventReceiver {
    pub fn try_recv(&mut self) -> Result<TwitchEvent, mpsc::error::TryRecvError> {
        self.event_rx.try_recv()
    }
    pub async fn recv(&mut self) -> Option<TwitchEvent> {
        self.event_rx.recv().await
    }
}

impl TwitchCommandSender {
    pub fn try_send(
        &mut self,
        command: TwitchCommand,
    ) -> Result<(), mpsc::error::TrySendError<TwitchCommand>> {
        self.command_tx.try_send(command)
    }

    pub async fn send(
        &mut self,
        command: TwitchCommand,
    ) -> Result<(), mpsc::error::SendError<TwitchCommand>> {
        self.command_tx.send(command).await
    }
}

pub enum TwitchEvent {
    LikeTrack {
        privmsg: PrivmsgMessage,
    },
    SendMessage {
        msg: String,
    },
    SendMessageReply {
        privmsg: PrivmsgMessage,
        msg: String,
    },
}

pub enum TwitchCommand {
    SendMessage {
        msg: String,
    },
    SendMessageReply {
        privmsg: PrivmsgMessage,
        msg: String,
    },
}

impl TwitchEvent {
    fn reply(privmsg: PrivmsgMessage, msg: impl Into<String>) -> Self {
        TwitchEvent::SendMessageReply {
            privmsg,
            msg: msg.into(),
        }
    }

    fn message(msg: impl Into<String>) -> Self {
        TwitchEvent::SendMessage { msg: msg.into() }
    }

    fn like(privmsg: PrivmsgMessage) -> Self {
        TwitchEvent::LikeTrack { privmsg }
    }
}
