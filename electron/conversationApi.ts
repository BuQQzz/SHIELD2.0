import { ipcRenderer } from "electron";
import type { ConversationAPI } from "../src/types/electron";

export const conversationAPI: ConversationAPI = {
  save: (conversation) =>
    ipcRenderer.invoke("conversations:save", conversation),
  load: (conversationId) =>
    ipcRenderer.invoke("conversations:load", conversationId),
  list: () => ipcRenderer.invoke("conversations:list"),
  delete: (conversationId) =>
    ipcRenderer.invoke("conversations:delete", conversationId),
  search: (query) => ipcRenderer.invoke("conversations:search", query),
};
