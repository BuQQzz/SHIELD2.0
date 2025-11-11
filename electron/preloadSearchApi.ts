import { ipcRenderer } from "electron";
import type {
  SearchResult,
  PageContent,
  PrivacyOptions,
} from "./services/WebSearchService";
import type { CacheStats } from "./services/WebCacheService";

export interface WebSearchSettings {
  maxCacheSizeMB?: number;
  cacheExpiryHours?: number;
}

export interface WebSearchAPI {
  initialize: (
    settings?: WebSearchSettings
  ) => Promise<{ success: boolean; error?: string }>;
  query: (
    query: string,
    maxResults?: number,
    options?: PrivacyOptions
  ) => Promise<{ success: boolean; results?: SearchResult[]; error?: string }>;
  fetch: (
    url: string,
    options?: PrivacyOptions
  ) => Promise<{
    success: boolean;
    content?: PageContent;
    fromCache?: boolean;
    error?: string;
  }>;
  cache: {
    get: (url: string) => Promise<{
      success: boolean;
      content?: PageContent | null;
      error?: string;
    }>;
    has: (
      url: string
    ) => Promise<{ success: boolean; has?: boolean; error?: string }>;
    stats: () => Promise<{
      success: boolean;
      stats?: CacheStats;
      error?: string;
    }>;
    clear: () => Promise<{ success: boolean; error?: string }>;
    clearExpired: () => Promise<{
      success: boolean;
      deletedCount?: number;
      error?: string;
    }>;
    export: () => Promise<{
      success: boolean;
      entries?: Array<{ url: string; content: string }>;
      error?: string;
    }>;
    delete: (url: string) => Promise<{ success: boolean; error?: string }>;
  };
}

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
