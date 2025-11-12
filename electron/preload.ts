/**
 * Preload Script - Exposes IPC APIs to renderer process
 * Split into modular API groups for maintainability
 */

import { contextBridge } from "electron";
import {
  exposeLlamaAPI,
  type LlamaAPI,
  type ModelConfig,
  type ChatOptions,
} from "./preload/llamaApi.js";
import {
  exposeConversationAPI,
  type ConversationAPI,
} from "./preload/conversationApi.js";
import { mcpAPI, type MCPAPI } from "./preload/mcpApi.js";
import { webSearchAPI, type WebSearchAPI } from "./preload/searchApi.js";
import {
  exposeElectronAPI,
  settingsAPI,
  type SettingsAPI,
  type AppSettings,
} from "./preload/otherApis.js";

// Re-export types for backward compatibility
export type {
  LlamaAPI,
  ModelConfig,
  ChatOptions,
  ConversationAPI,
  MCPAPI,
  WebSearchAPI,
  SettingsAPI,
  AppSettings,
};

// Expose all APIs to renderer process
exposeLlamaAPI();
exposeConversationAPI();
exposeElectronAPI();

// Expose MCP and WebSearch APIs directly (already have implementations)
contextBridge.exposeInMainWorld("mcp", mcpAPI);
contextBridge.exposeInMainWorld("webSearch", webSearchAPI);

// Also expose settings API directly for backward compatibility
contextBridge.exposeInMainWorld("settings", settingsAPI);

console.log(
  "[preload] All APIs exposed successfully: llama, conversations, electronAPI, mcp, webSearch, settings"
);
