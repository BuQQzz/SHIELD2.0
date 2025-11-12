/**
 * Other APIs - Settings, Export, Model Download, System
 */

import { ipcRenderer, contextBridge } from "electron";
import type { Conversation } from "../../src/types/conversation";
import type {
  ModelDownloadAPI,
  DownloadProgress,
  SystemAPI,
} from "../../src/types/electron";

export interface AppSettings {
  model: {
    temperature: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
    contextLength: number;
    maxTokens: number;
  };
  system: {
    systemPrompt: string;
    autoSave: boolean;
    confirmDelete: boolean;
  };
  privacy: {
    telemetry: boolean;
    analytics: boolean;
  };
}

export interface SettingsAPI {
  load: () => Promise<AppSettings | null>;
  save: (
    settings: AppSettings
  ) => Promise<{ success: boolean; error?: string }>;
}

export interface SettingsPersistenceAPI {
  load: () => Promise<AppSettings>;
  save: (settings: AppSettings) => Promise<boolean>;
  export: (settings: AppSettings) => Promise<string | null>;
  import: () => Promise<AppSettings | null>;
  reset: () => Promise<AppSettings>;
}

export interface ExportAPI {
  exportJSON: (conversation: Conversation) => Promise<boolean>;
  exportMarkdown: (conversation: Conversation) => Promise<boolean>;
  import: () => Promise<Conversation | null>;
}

export const settingsAPI: SettingsAPI = {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings) => ipcRenderer.invoke("settings:save", settings),
};

export const settingsPersistenceAPI: SettingsPersistenceAPI = {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings) => ipcRenderer.invoke("settings:save", settings),
  export: (settings) => ipcRenderer.invoke("settings:export", settings),
  import: () => ipcRenderer.invoke("settings:import"),
  reset: () => ipcRenderer.invoke("settings:reset"),
};

export const exportAPI: ExportAPI = {
  exportJSON: (conversation) =>
    ipcRenderer.invoke("conversation:export-json", conversation),
  exportMarkdown: (conversation) =>
    ipcRenderer.invoke("conversation:export-markdown", conversation),
  import: () => ipcRenderer.invoke("conversation:import"),
};

export const modelDownloadAPI: ModelDownloadAPI = {
  download: (modelId) => ipcRenderer.invoke("model:download", modelId),
  cancel: (modelId) => ipcRenderer.invoke("model:cancel", modelId),
  getProgress: (modelId) => ipcRenderer.invoke("model:get-progress", modelId),
  getActiveDownloads: () => ipcRenderer.invoke("model:get-active-downloads"),
  listInstalled: () => ipcRenderer.invoke("model:list-installed"),
  isInstalled: (modelId) => ipcRenderer.invoke("model:is-installed", modelId),
  delete: (modelId) => ipcRenderer.invoke("model:delete", modelId),
  getDiskSpace: () => ipcRenderer.invoke("model:get-disk-space"),
  onProgress: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: DownloadProgress
    ) => {
      callback(progress);
    };
    ipcRenderer.on("model:download-progress", handler);
    return () => {
      ipcRenderer.removeListener("model:download-progress", handler);
    };
  },
};

export const systemAPI: SystemAPI = {
  selectDirectory: () => ipcRenderer.invoke("system:select-directory"),
};

export function exposeElectronAPI(): void {
  contextBridge.exposeInMainWorld("electronAPI", {
    settings: settingsAPI,
    settingsPersistence: settingsPersistenceAPI,
    export: exportAPI,
    modelDownload: modelDownloadAPI,
    system: systemAPI,
  });
}
