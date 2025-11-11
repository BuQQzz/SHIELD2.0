import { ipcRenderer } from "electron";
import type {
  ModelDownloadAPI,
  DownloadProgress,
} from "../src/types/electron";

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
