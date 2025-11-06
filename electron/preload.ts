import { contextBridge } from "electron";
import { llamaAPI } from "./llamaApi";
import { conversationAPI } from "./conversationApi";
import { settingsAPI, settingsPersistenceAPI } from "./settingsApi";
import { exportAPI } from "./exportApi";
import { webSearchAPI } from "./searchApi";
import { mcpAPI } from "./mcpApi";
import { modelDownloadAPI } from "./modelApi";
import { systemAPI } from "./systemApi";

// Expose llama API to renderer process
contextBridge.exposeInMainWorld("llama", llamaAPI);

// Expose conversations API to renderer process
contextBridge.exposeInMainWorld("conversations", conversationAPI);

// Expose electronAPI with all sub-APIs to renderer process
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
  "[preload] window.llama, window.conversations, window.electronAPI (settings, export, webSearch, mcp, modelDownload, system) exposed successfully"
);
