import { contextBridge } from "electron";
import { llamaAPI } from "./preloadLlamaApi";
import { conversationAPI } from "./preloadConversationApi";
import { settingsAPI, settingsPersistenceAPI } from "./preloadSettingsApi";
import { exportAPI } from "./preloadExportApi";
import { webSearchAPI } from "./preloadSearchApi";
import { mcpAPI } from "./preloadMcpApi";
import { modelDownloadAPI } from "./preloadModelApi";
import { systemAPI } from "./preloadSystemApi";

// Export type interfaces for renderer
export type { LlamaAPI, ModelConfig, ChatOptions } from "./preloadLlamaApi";
export type { ConversationAPI } from "./preloadConversationApi";
export type { AppSettings, SettingsAPI, SettingsPersistenceAPI } from "./preloadSettingsApi";
export type { ExportAPI } from "./preloadExportApi";
export type { WebSearchAPI, WebSearchSettings } from "./preloadSearchApi";
export type { MCPAPI } from "./preloadMcpApi";

// Expose APIs to renderer process via contextBridge
contextBridge.exposeInMainWorld("llama", llamaAPI);
contextBridge.exposeInMainWorld("conversations", conversationAPI);

contextBridge.exposeInMainWorld("electronAPI", {
  settings: settingsAPI,
  settingsPersistence: settingsPersistenceAPI,
  export: exportAPI,
  webSearch: webSearchAPI,
  mcp: mcpAPI,
  modelDownload: modelDownloadAPI,
  system: systemAPI,
});

// Log that preload executed successfully
console.log(
  "[preload] window.llama, window.conversations, window.electronAPI (settings, export, webSearch, mcp) exposed successfully"
);
