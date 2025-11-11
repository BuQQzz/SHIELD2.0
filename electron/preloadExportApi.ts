import { ipcRenderer } from "electron";
import type { Conversation } from "../src/types/conversation";

export interface ExportAPI {
  exportJSON: (conversation: Conversation) => Promise<boolean>;
  exportMarkdown: (conversation: Conversation) => Promise<boolean>;
  import: () => Promise<Conversation | null>;
}

export const exportAPI: ExportAPI = {
  exportJSON: (conversation) =>
    ipcRenderer.invoke("conversation:export-json", conversation),
  exportMarkdown: (conversation) =>
    ipcRenderer.invoke("conversation:export-markdown", conversation),
  import: () => ipcRenderer.invoke("conversation:import"),
};
