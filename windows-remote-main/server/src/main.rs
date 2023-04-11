use actix::prelude::*;
use actix_web::{
    web,
    Error, HttpRequest, HttpResponse, Result,
};
use actix_web_actors::ws;

mod remote_server;
mod remote_session;

async fn remote_route(
    req: HttpRequest,
    stream: web::Payload,
    server: web::Data<Addr<remote_server::RemoteServer>>,
) -> Result<HttpResponse, Error> {
    let path = req.path();

    let uuid = &path[8..path.len()];

    let resp = ws::start(
        remote_session::Ws {
            id: 0,
            uuid: uuid.to_string(),
            addr: server.get_ref().clone(),
        },
        &req,
        stream,
    )?;
    Ok(resp)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    use actix_web::{App, HttpServer};

    let server = remote_server::RemoteServer::new().start();

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(server.clone()))
            .route("/remote/{account}", web::get().to(remote_route))
    })
    .bind(("0.0.0.0", 11451))?
    .run()
    .await
}
