1. let this be a more adventurish journey for me, where I state everything everything that comes to my mind
in comment form, not taking anything just inside my head, im gonna act like a very verbose LLM lol!

ok first of all, I have drawn in my notes that I have mainly these services to work:
     1 - music streaming service, it should work through the openmsubsonic api, it should spawn a process that just plays music
     2 - twitch bot service, which should just listen to commands sent in the messages, or maybe it should send messages too?
     3 - http server that creates a little neat cute graphical page for our obs stream to get from with localhost!

what i struggle right now is understanding how should these work exactly and glue together?

music streamer and painter are deeply interwined,
music streamer and command too,
the twitch bot should track stuff on its own too, or should i have a fourth service that tracks the users' preference of each song? idk!

well, what is well known for us now is that

twitch bot <---> music service <---> graphics service

let me ask deepseek for a guidance, only a keyword, and no code explanation :
what design pattern is most recommended for this? i know of mvc, but idk if it fits!

... ok the mediator pattern, i didnt think of that (purnya who hasn't thought of that). 
I feel dumb for not thinking about it, but smarter for knowing now!

found this neat site : https://refactoring.guru/design-patterns/mediator
if I am deciding to implement the mediator pattern that means that I have to make these structs :

- TwitchBot.rs
- MusicServer.rs
- GraphicsServer.rs
  - I really hate myself so i decided to make the graphics server in webGL
