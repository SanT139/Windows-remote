import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/tauri";
import { appWindow } from "@tauri-apps/api/window";

import {
  MouseStatus,
  WheelStatus,
  KeyboardStatus,
  MessageType,
  InputEventType,
} from "./common/Constans";

import handlerEvent from "./common/InputEvent";
import { sendToClient, sendToServer } from "./common/Handler";

import "./App.css";

interface SessionMessage {
  message_type: MessageType;
  receiver: string;
  sender: string;
  message: string;
}

const [server, setServer] = createSignal({
  address: "",
  port: "",
})
const [connect, setConnect] = createSignal(false)
const [isConnect, setIsConnect] = createSignal(false)

const [account, setAccount] = createSignal({
  id: "",
  key: ""
})
const [receiver, setReceiver] = createSignal({
  id: "",
  key: ""
})
const [showDesktop, setShowDesktop] = createSignal(false)

let desktop: HTMLVideoElement;

let ws: WebSocket, pc: RTCPeerConnection, dc: RTCDataChannel, webcamStream: MediaStream, remoteDesktopDpi: Record<string, any>;

function initWebSocket() {
  if (!server().address || !server().port) {
    alert("请先设置服务器地址和端口");
    return;
  }

  setIsConnect(true);
  ws = new WebSocket(`ws://${server().address}:${server().port}/remote/${account().id}`);

  ws.onopen = (e: Event) => {
    setConnect(true);
    setIsConnect(false);
    sendToServer(ws, {
      message_type: "heart",
      receiver: "",
      sender: "",
      message: "",
    });
    setInterval(() => {
      sendToServer(ws, {
        message_type: "heart",
        receiver: "",
        sender: "",
        message: "",
      });
    }, 1000 * 60);
  }

  ws.onmessage = async (e: MessageEvent) => {
    const msg: SessionMessage = JSON.parse(e.data);
    switch (msg.message_type) {
      case MessageType.VIDEO_OFFER:
        handleVideoOfferMsg(msg);
        break;
      case MessageType.VIDEO_ANSWER:
        handleVideoAnswerMsg(msg);
        break;
      case MessageType.NEW_ICE_CANDIDATE:
        handleNewICECandidateMsg(msg);
        break;
      case MessageType.REMOTE_DESKTOP:
        handleRemoteDesktopRequest(msg);
        break;
      case MessageType.CLOSE_REMOTE_DESKTOP:
        close();
        break;
    }
  }

  ws.onerror = (err) => {
    setIsConnect(false);
    alert("websocket连接失败");
  };
}

setAccount(await invoke("generate_account"));

const handleVideoOfferMsg = async (msg: SessionMessage) => {
  receiver().id = msg.sender;
  await initRTCPeerConnection();
  const desc = new RTCSessionDescription(JSON.parse(msg.message));
  await pc.setRemoteDescription(desc);
  await pc.setLocalDescription(await pc.createAnswer());
  sendToServer(ws, {
    message_type: MessageType.VIDEO_ANSWER,
    receiver: receiver().id,
    message: JSON.stringify(pc.localDescription),
    sender: account().id,
  });
};
const handleVideoAnswerMsg = async (msg: SessionMessage) => {
  const desc = new RTCSessionDescription(JSON.parse(msg.message));
  await pc.setRemoteDescription(desc).catch(reportError);
};
const handleNewICECandidateMsg = async (msg: SessionMessage) => {
  const candidate = new RTCIceCandidate(JSON.parse(msg.message));
  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    reportError(err);
  }
};
const handleRemoteDesktopRequest = async (msg: SessionMessage) => {
  if (msg.message !== account().key) {
    console.log("key error!");
    return;
  }
  receiver().id = msg.sender;
  await initRTCPeerConnection();
  initRTCDataChannel();

  webcamStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });

  webcamStream.getTracks().forEach((track: MediaStreamTrack) =>
    pc.addTrack(track, webcamStream)
  );
  sendOffer();
};

const initRTCPeerConnection = async () => {
  const iceServer: object = {
    iceServers: [
      {
        url: "stun:stun.l.google.com:19302",
      },
      {
        url: "turn:numb.viagenie.ca",
        username: "webrtc@live.com",
        credential: "muazkh",
      },
    ],
  };
  pc = new RTCPeerConnection(iceServer);
  pc.onicecandidate = handleICECandidateEvent;
  pc.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
  pc.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
  pc.onsignalingstatechange = handleSignalingStateChangeEvent;
  pc.ontrack = handleTrackEvent;
  pc.ondatachannel = handleDataChannel;
};
const handleICECandidateEvent = (event: RTCPeerConnectionIceEvent) => {
  if (event.candidate) {
    sendToServer(ws, {
      message_type: MessageType.NEW_ICE_CANDIDATE,
      receiver: receiver().id,
      message: JSON.stringify(event.candidate),
      sender: account().id,
    });
  }
};
const handleICEConnectionStateChangeEvent = (event: Event) => {
  console.log("*** ICE连接状态变为" + pc.iceConnectionState);
};
const handleICEGatheringStateChangeEvent = (event: Event) => {
  console.log("*** ICE聚集状态变为" + pc.iceGatheringState);
};
const handleSignalingStateChangeEvent = (event: Event) => {
  console.log("*** WebRTC信令状态变为: " + pc.signalingState);
};

const handleTrackEvent = (event: RTCTrackEvent) => {
  desktop!.srcObject = event.streams[0];
  document.onkeydown = (e: KeyboardEvent) => {
    sendToClient(dc, {
      type: InputEventType.KEY_EVENT,
      data: {
        eventType: KeyboardStatus.MOUSE_DOWN,
        key: e.key,
      },
    });
  };
  document.onkeyup = (e: KeyboardEvent) => {
    sendToClient(dc, {
      type: InputEventType.KEY_EVENT,
      data: {
        eventType: KeyboardStatus.MOUSE_UP,
        key: e.key,
      },
    });
  };
};

const handleDataChannel = (e: RTCDataChannelEvent) => {
  console.log("datachannel", e)
  dc = e.channel;
  dc.onopen = (e: Event) => {
    console.log("datachannel open");
  };
  dc.onmessage = (event: MessageEvent) => {
    remoteDesktopDpi = JSON.parse(event.data);
  };
  dc.onclose = (e: Event) => {
    console.log("datachannel close");
  };
};

const initRTCDataChannel = () => {
  dc = pc.createDataChannel("my channel", {
    ordered: true,
  });

  console.log(dc);
  dc.onopen = (e: Event) => {
    dc.send(
      JSON.stringify({
        width: window.screen.width * window.devicePixelRatio,
        height: window.screen.height * window.devicePixelRatio,
      })
    );
  };
  dc.onmessage = (event: MessageEvent) => {
    let msg: Record<string, any> = JSON.parse(event.data);
    switch (msg.type) {
      case InputEventType.MOUSE_EVENT:
        handlerEvent(msg.data, "mouse");
        break;
      case InputEventType.KEY_EVENT:
        handlerEvent(msg.data, "keyborad");
        break;
    }
  };
  dc.onclose = (e: Event) => {
    console.log("datachannel close");
  };
};

const sendOffer = async () => {
  const offer = await pc.createOffer();

  await pc.setLocalDescription(offer);

  sendToServer(ws, {
    message_type: MessageType.VIDEO_OFFER,
    receiver: receiver().id,
    message: JSON.stringify(pc.localDescription),
    sender: account().id,
  });
};

const remoteDesktop = async () => {
  if (!receiver().id || !receiver().key) {
    alert("请输入id和key");
    return;
  }
  appWindow.setFullscreen(true);

  setShowDesktop(true);
  sendToServer(ws, {
    message_type: MessageType.REMOTE_DESKTOP,
    receiver: receiver().id,
    message: receiver().key,
    sender: account().id,
  });
};

const closeRemoteDesktop = async () => {
  appWindow.setFullscreen(false);
  setShowDesktop(false);
  close();
  sendToServer(ws, {
    message_type: MessageType.CLOSE_REMOTE_DESKTOP,
    receiver: receiver().id,
    message: receiver().key,
    sender: account().id,
  });
};

const mouseDown = (e: MouseEvent) => {
  sendMouseEvent(e.x, e.y, mouseType(MouseStatus.MOUSE_DOWN, e.button));
};

const mouseUp = (e: MouseEvent) => {
  sendMouseEvent(e.x, e.y, mouseType(MouseStatus.MOUSE_UP, e.button));
};

const wheel = (e: WheelEvent) => {
  let type = e.deltaY > 0 ? WheelStatus.WHEEL_UP : WheelStatus.WHEEL_DOWN;
  sendMouseEvent(e.x, e.y, type);
};

const mouseMove = (e: MouseEvent) => {
  sendMouseEvent(e.x, e.y, MouseStatus.MOUSE_MOVE);
};

const rightClick = (e: MouseEvent) => {
  e.preventDefault();
  sendMouseEvent(e.x, e.y, MouseStatus.RIGHT_CLICK);
};

const sendMouseEvent = (x: number, y: number, eventType: string) => {
  if (remoteDesktopDpi) {
    let widthRatio = remoteDesktopDpi.width / desktop!.clientWidth;
    let heightRatio = remoteDesktopDpi.height / desktop!.clientHeight;
    let data = {
      x: parseInt((x * widthRatio).toFixed(0)),
      y: parseInt((y * heightRatio).toFixed(0)),
      eventType: eventType,
    };
    sendToClient(dc, {
      type: InputEventType.MOUSE_EVENT,
      data: data,
    });
  }
};

const mouseType = (mouseStatus: MouseStatus, button: number) => {
  let type = "";
  switch (button) {
    case 0:
      type = "left-" + mouseStatus;
      break;
    case 2:
      type = "right-" + mouseStatus;
      break;
  }
  return type;
};

const close = () => {
  if (desktop!.srcObject) {
    const tracks = desktop!.srcObject as MediaStream;
    tracks.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    desktop!.srcObject = null;
  } else {
    webcamStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  }
  pc?.close();
};

function App() {
  return <>
    <div class="sidebar">
      <div>
        <p>
          id: <span>{account().id}</span>
        </p>
        <p>
          key: <span>{account().key}</span>
        </p>
      </div>
    </div>
    <div class="form">
      <Show when={connect()}
        fallback={
          () => <>
            <input
              disabled={isConnect()}
              onInput={(e: any) => setServer({
                address: e.target.value,
                port: server().port
              })}
              type="text"
              placeholder="请输入服务器地址"
            />
            <input
              disabled={isConnect()}
              onInput={(e: any) => setServer({
                address: server().address,
                port: e.target.value
              })}
              type="text"
              placeholder="请输入服务器端口"
            />
            <button disabled={isConnect()} onclick={initWebSocket}>
              连接服务器
            </button>
          </>}>
        <input
          onInput={(e: any) => setReceiver({
            id: e.target.value,
            key: receiver().key
          })}
          type="text"
          placeholder="请输入对方id"
        />
        <input
          onInput={(e: any) => setReceiver({
            id: receiver().id,
            key: e.target.value
          })}
          type="text"
          placeholder="请输入对方密钥"
        />
        <button onclick={remoteDesktop}>
          发起远程
        </button>
      </Show>
    </div>
    <Show when={showDesktop()}>
      <video
        class="desktop"
        ref={desktop}
        onmousedown={mouseDown}
        onmouseup={mouseUp}
        onmousemove={mouseMove}
        onwheel={wheel}
        oncontextmenu={rightClick}
        autoplay>
      </video>
    </Show>
    <Show when={showDesktop()}>
      <button class="close-btn" onClick={closeRemoteDesktop}>
        关闭
      </button>
    </Show>
  </>

}

export default App;
