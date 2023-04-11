import { invoke } from "@tauri-apps/api";
import { UserCommand } from "./Constans"

const handlerEvent = async (data: Record<string, any>, eventType: "mouse" | "keyborad") => {
  await invoke(eventType === "mouse" ? UserCommand.MOUSE_EVENT : UserCommand.KEY_EVENT, data);
}

export default handlerEvent;