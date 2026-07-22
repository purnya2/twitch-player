use crate::mediator::Mediator;

mod graphic_server;
mod mediator;
mod music_server;

#[tokio::main]
async fn main() {
    let mut mediator = Mediator::new();
    mediator.run().await;
}
