use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use actix::prelude::*;

#[derive(Message)]
#[rtype(result = "()")]
pub struct Message(pub String);

pub struct RemoteServer {
    sessions: HashMap<String, Recipient<Message>>,
}

impl RemoteServer {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    fn send_msg(&self, message_type: String, receiver: String, message: String) {
        match message_type.as_str() {
            "heart" => {
                println!("heart");
            }
            _ => {
                if let Some(addr) = self.sessions.get(&receiver) {
                    println!("send message: {}", message);
                    println!("send to: {}", receiver);
                    addr.do_send(Message(message));
                }
            }
        }
    }
}

impl Actor for RemoteServer {
    type Context = Context<Self>;
}

#[derive(Message)]
#[rtype(usize)]
pub struct Connect {
    pub uuid: String,
    pub addr: Recipient<Message>,
}

impl Handler<Connect> for RemoteServer {
    type Result = usize;

    fn handle(&mut self, msg: Connect, _: &mut Context<Self>) -> Self::Result {
        let uuid = msg.uuid;
        println!("Connected: {}", uuid);
        self.sessions.insert(uuid, msg.addr);
        0
    }
}

#[derive(Message)]
#[rtype(result = "()")]
pub struct Disconnect {
    pub uuid: String,
}

impl Handler<Disconnect> for RemoteServer {
    type Result = ();

    fn handle(&mut self, msg: Disconnect, _: &mut Context<Self>) -> Self::Result {
        self.sessions.remove(&msg.uuid);
    }
}

#[derive(Debug, Serialize, Deserialize, Message)]
#[rtype(result = "()")]
pub struct ClientMessage {
    pub message_type: String,
    pub receiver: String,
    pub sender: String,
    pub message: String,
}

impl Handler<ClientMessage> for RemoteServer {
    type Result = ();

    fn handle(&mut self, msg: ClientMessage, _: &mut Self::Context) -> Self::Result {
        let message_type = msg.message_type.clone();
        match message_type.as_str() {
            "heart" => {
                println!("heart2")
            }
            _ => {
                let receiver = msg.receiver.clone();
                let message_type = msg.message_type.clone();
                let json = serde_json::to_string(&msg).unwrap();
                self.send_msg(message_type, receiver, json);
            }
        }
    }
}
