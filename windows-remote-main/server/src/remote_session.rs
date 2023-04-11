use actix::prelude::*;
use actix_web_actors::ws;

use crate::remote_server;

#[derive(Debug)]
pub struct Ws {
    pub id: usize,
    pub uuid: String,
    pub addr: Addr<remote_server::RemoteServer>,
}

impl Handler<remote_server::Message> for Ws {
    type Result = ();

    fn handle(&mut self, msg: remote_server::Message, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

impl Actor for Ws {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        let addr = ctx.address();
        self.addr
            .send(remote_server::Connect {
                uuid: self.uuid.clone(),
                addr: addr.recipient(),
            })
            .into_actor(self)
            .then(|res, act, ctx| {
                match res {
                    Ok(res) => act.id = res,
                    _ => ctx.stop(),
                }
                fut::ready(())
            })
            .wait(ctx);
    }

    fn stopping(&mut self, _: &mut Self::Context) -> Running {
        self.addr.do_send(remote_server::Disconnect {
            uuid: self.uuid.clone(),
        });
        Running::Stop
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for Ws {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => ctx.pong(&msg),
            Ok(ws::Message::Text(text)) => {
                let text = text.to_string();
                let message: remote_server::ClientMessage = serde_json::from_str(&text).unwrap();
                self.addr.do_send(message);
            }
            Ok(ws::Message::Binary(bin)) => ctx.binary(bin),
            _ => (),
        }
    }
}
