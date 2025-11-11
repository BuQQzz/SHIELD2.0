import { ipcRenderer } from "electron";
import type {
  Conversation,
  ConversationMetadata,
} from "../src/types/conversation";

export interface ConversationAPI {
  save: (
    conversation: Conversation
  ) => Promise<{ success: boolean; error?: string }>;
  load: (
    conversationId: string
  ) => Promise<{ conversation?: Conversation; error?: string }>;
  list: () => Promise<{
    conversations: ConversationMetadata[];
    error?: string;
  }>;
  delete: (
    conversationId: string
  ) => Promise<{ success: boolean; error?: string }>;
  search: (
    query: string
  ) => Promise<{ conversations: ConversationMetadata[]; error?: string }>;
}

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
