import { contextBridge, ipcRenderer } from "electron";
import type { Conversation, ConversationMetadata } from "../src/types/conversation";

export interface ModelConfig {
  name: string;
  uri: string;
  contextSize?: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LlamaAPI {
  initialize: () => Promise<{ success: boolean; error?: string }>;
  loadModel: (
    config: ModelConfig
  ) => Promise<{ success: boolean; error?: string }>;
  chat: (
    message: string,
    options?: ChatOptions
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  chatStreaming: (
    message: string,
    options?: ChatOptions
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  onToken: (callback: (token: string) => void) => () => void;
  getModelInfo: () => Promise<{
    success: boolean;
    info?: ModelConfig | null;
    error?: string;
  }>;
  isModelLoaded: () => Promise<{ success: boolean; loaded?: boolean; error?: string }>;
  clearHistory: () => Promise<{ success: boolean; error?: string }>;
  setChatHistory: (messages: any[]) => Promise<{ success: boolean; error?: string }>;
  stopGeneration: () => Promise<{ success: boolean; error?: string }>;
  generateTitle: (userMessage: string) => Promise<{ success: boolean; title?: string; error?: string }>;
}

export interface ConversationAPI {
  save: (conversation: Conversation) => Promise<{ success: boolean; error?: string }>;
  load: (conversationId: string) => Promise<{ conversation?: Conversation; error?: string }>;
  list: () => Promise<{ conversations: ConversationMetadata[]; error?: string }>;
  delete: (conversationId: string) => Promise<{ success: boolean; error?: string }>;
  search: (query: string) => Promise<{ conversations: ConversationMetadata[]; error?: string }>;
}

// Expose protected methods to renderer process
const llamaAPI: LlamaAPI = {
  initialize: () => ipcRenderer.invoke("llama:initialize"),
  loadModel: (config) => ipcRenderer.invoke("llama:loadModel", config),
  chat: (message, options) => ipcRenderer.invoke("llama:chat", message, options),
  chatStreaming: (message, options) =>
    ipcRenderer.invoke("llama:chatStreaming", message, options),
  onToken: (callback) => {
    const subscription = (_event: Electron.IpcRendererEvent, token: string) =>
      callback(token);
    ipcRenderer.on("llama:token", subscription);
    return () => ipcRenderer.removeListener("llama:token", subscription);
  },
  getModelInfo: () => ipcRenderer.invoke("llama:getModelInfo"),
  isModelLoaded: () => ipcRenderer.invoke("llama:isModelLoaded"),
  clearHistory: () => ipcRenderer.invoke("llama:clearHistory"),
  setChatHistory: (messages) => ipcRenderer.invoke("llama:setChatHistory", messages),
  stopGeneration: () => ipcRenderer.invoke("llama:stopGeneration"),
  generateTitle: (userMessage) => ipcRenderer.invoke("llama:generateTitle", userMessage),
};

contextBridge.exposeInMainWorld("llama", llamaAPI);

const conversationAPI: ConversationAPI = {
  save: (conversation) => ipcRenderer.invoke("conversations:save", conversation),
  load: (conversationId) => ipcRenderer.invoke("conversations:load", conversationId),
  list: () => ipcRenderer.invoke("conversations:list"),
  delete: (conversationId) => ipcRenderer.invoke("conversations:delete", conversationId),
  search: (query) => ipcRenderer.invoke("conversations:search", query),
};

contextBridge.exposeInMainWorld("conversations", conversationAPI);

// Log that preload executed successfully
console.log("[preload] window.llama and window.conversations exposed successfully");

// Type declaration for TypeScript
declare global {
  interface Window {
    llama: LlamaAPI;
    conversations: ConversationAPI;
  }
}
