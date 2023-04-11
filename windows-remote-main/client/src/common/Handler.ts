export const sendToServer = (ws: WebSocket, msg: Record<string, any>) => {
  ws.send(JSON.stringify(msg))
}

export const sendToClient = (dc: RTCDataChannel, msg: Record<string, any>) => {
  dc?.readyState === "open" && dc.send(JSON.stringify(msg))
}


