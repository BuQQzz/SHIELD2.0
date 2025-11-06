import { ipcRenderer } from "electron";
import type { ExportAPI, Conversation } from "../src/types/electron";

export const exportAPI: ExportAPI = {
  exportJSON: (conversation: Conversation) =>
    ipcRenderer.invoke("conversation:export-json", conversation),
  exportMarkdown: (conversation: Conversation) =>
    ipcRenderer.invoke("conversation:export-markdown", conversation),
  import: () => ipcRenderer.invoke("conversation:import"),
};
