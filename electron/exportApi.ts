import { ipcRenderer } from "electron";
import type { ExportAPI } from "../src/types/electron";
import type { Conversation } from "../src/types/conversation";

export const exportAPI: ExportAPI = {
  exportJSON: (conversation: Conversation) =>
    ipcRenderer.invoke("conversation:export-json", conversation),
  exportMarkdown: (conversation: Conversation) =>
    ipcRenderer.invoke("conversation:export-markdown", conversation),
  import: () => ipcRenderer.invoke("conversation:import"),
};
