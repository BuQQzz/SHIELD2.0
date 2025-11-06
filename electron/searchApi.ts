import { ipcRenderer } from "electron";
import type { WebSearchAPI } from "../src/types/electron";

export const webSearchAPI: WebSearchAPI = {
  initialize: (settings) =>
    ipcRenderer.invoke("web-search:initialize", settings),
  query: (query, maxResults, options) =>
    ipcRenderer.invoke("web-search:query", query, maxResults, options),
  fetch: (url, options) => ipcRenderer.invoke("web-search:fetch", url, options),
  cache: {
    get: (url) => ipcRenderer.invoke("web-search:cache-get", url),
    has: (url) => ipcRenderer.invoke("web-search:cache-has", url),
    stats: () => ipcRenderer.invoke("web-search:cache-stats"),
    clear: () => ipcRenderer.invoke("web-search:cache-clear"),
    clearExpired: () => ipcRenderer.invoke("web-search:cache-clear-expired"),
    export: () => ipcRenderer.invoke("web-search:cache-export"),
    delete: (url) => ipcRenderer.invoke("web-search:cache-delete", url),
  },
};
