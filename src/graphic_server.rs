use std::{convert::Infallible, time::Duration};

use axum::extract::State;
use axum::{
    Router,
    response::sse::{Event, Sse},
    routing::get,
    serve::Listener,
};
use axum_extra::TypedHeader;
use futures_util::stream::{self, Stream};
use serde_json::json;
use tokio::sync::{broadcast, mpsc};
use tokio_stream::{StreamExt as _, wrappers::ReceiverStream}; // Correct import
use tower_http::{services::ServeDir, trace::TraceLayer}; // Use mpsc instead of broadcast // Add this import
#[derive(Clone)]
pub struct AppState {
    event_tx: broadcast::Sender<Event>,
}

pub struct GraphicServer {
    event_tx: broadcast::Sender<Event>,
}

#[derive(Clone)]
pub struct GraphicServerSender {
    event_tx: broadcast::Sender<Event>,
}

impl GraphicServer {
    pub fn new() -> (Self, GraphicServerSender) {
        let (tx, _rx) = broadcast::channel(100);
        let server = Self {
            event_tx: tx.clone(),
        };
        let sender = GraphicServerSender { event_tx: tx };
        (server, sender)
    }

    pub async fn run(&self) {
        let state = AppState {
            event_tx: self.event_tx.clone(),
        };

        let app: Router = Router::new()
            .route("/sse", axum::routing::get(sse_handler))
            .fallback_service(ServeDir::new("./web").append_index_html_on_directories(true))
            .layer(TraceLayer::new_for_http())
            .with_state(state);
        // TODO this should be configurable kek
        let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
            .await
            .unwrap();

        axum::serve(listener, app).await.unwrap();
    }
    pub fn sender(&self) -> GraphicServerSender {
        GraphicServerSender {
            event_tx: self.event_tx.clone(),
        }
    }
}

impl GraphicServerSender {
    pub fn send_event(&self, event: Event) -> Result<(), broadcast::error::SendError<Event>> {
        self.event_tx.send(event)?;
        Ok(())
    }
}
async fn sse_handler(
    TypedHeader(user_agent): TypedHeader<headers::UserAgent>,
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    println!("`{}` connected", user_agent.as_str());

    let mut rx = state.event_tx.subscribe();
    let stream = async_stream::stream! {
        loop {
            match rx.recv().await {
                Ok(event) => yield Ok(event),
                Err(broadcast::error::RecvError::Closed) => {
                    break;
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    // Handle lagged messages
                    yield Ok(Event::default()
                        .event("error")
                        .data(format!("Lagged by {} messages", n)));
                }
            }
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(1))
            .text("keep-alive-text"),
    )
}
