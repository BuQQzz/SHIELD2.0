/**
 * Llama API - IPC bridge for llama.cpp inference
 */

import { ipcRenderer, contextBridge } from "electron";
import type { Message } from "../../src/types/conversation";

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
  isModelLoaded: () => Promise<{
    success: boolean;
    loaded?: boolean;
    error?: string;
  }>;
  clearHistory: () => Promise<{ success: boolean; error?: string }>;
  setChatHistory: (
    messages: Message[]
  ) => Promise<{ success: boolean; error?: string }>;
  stopGeneration: () => Promise<{ success: boolean; error?: string }>;
  setSystemPrompt: (
    prompt: string
  ) => Promise<{ success: boolean; error?: string }>;
  getSystemPrompt: () => Promise<{
    success: boolean;
    prompt?: string;
    error?: string;
  }>;
  generateTitle: (
    userMessage: string
  ) => Promise<{ success: boolean; title?: string; error?: string }>;
}

export const llamaAPI: LlamaAPI = {
  initialize: () => ipcRenderer.invoke("llama:initialize"),
  loadModel: (config) => ipcRenderer.invoke("llama:loadModel", config),
  chat: (message, options) =>
    ipcRenderer.invoke("llama:chat", message, options),
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
  setChatHistory: (messages) =>
    ipcRenderer.invoke("llama:setChatHistory", messages),
  stopGeneration: () => ipcRenderer.invoke("llama:stopGeneration"),
  setSystemPrompt: (prompt) =>
    ipcRenderer.invoke("llama:setSystemPrompt", prompt),
  getSystemPrompt: () => ipcRenderer.invoke("llama:getSystemPrompt"),
  generateTitle: (userMessage) =>
    ipcRenderer.invoke("llama:generateTitle", userMessage),
};

export function exposeLlamaAPI(): void {
  contextBridge.exposeInMainWorld("llama", llamaAPI);
}
