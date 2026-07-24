use std::{convert::Infallible, time::Duration};

use axum::extract::State;
use axum::{
    Router,
    response::sse::{Event, Sse},
};
use axum_extra::TypedHeader;
use futures_util::stream::Stream;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tower_http::{services::ServeDir, trace::TraceLayer};
/* keeping this, because i dont know if in the future i'll need to have a more complex AppState
#[derive(Clone)]
pub struct AppState {
    event_tx: broadcast::Sender<Event>,
}*/

#[derive(Clone)]
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
        /*let state = AppState {
            event_tx: self.event_tx.clone(),
        };*/

        let addr = "127.0.0.1:3000".to_owned();

        let cors = CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);

        let app: Router = Router::new()
            .route("/sse", axum::routing::get(sse_handler))
            .fallback_service(ServeDir::new("./web").append_index_html_on_directories(true))
            .layer(TraceLayer::new_for_http())
            .layer(cors)
            .with_state(self.clone());
        // TODO this should be configurable kek
        let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
        println!("\nServing browser view on : {}", addr);
        println!("in OBS, create a Browser component and paste this url!");
        println!("http://{}\n", addr);

        axum::serve(listener, app).await.unwrap();
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
    State(state): State<GraphicServer>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    println!(
        "`{}` has connected to the SSE endpoint",
        user_agent.as_str()
    );

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
