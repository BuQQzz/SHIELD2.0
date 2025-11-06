import { contextBridge, ipcRenderer } from "electron";
import type {
  Conversation,
  ConversationMetadata,
  Message,
} from "../src/types/conversation";
import type {
  SearchResult,
  PageContent,
  PrivacyOptions,
} from "./services/WebSearchService";
import type { CacheStats } from "./services/WebCacheService";
import type {
  MCPToolCall,
  MCPToolResult,
  MCPServerConfig,
} from "./services/MCPService";
import type {
  AuditLogEntry,
  AuditLogQueryOptions,
} from "./services/AuditLogService";
import type {
  ModelDownloadAPI,
  DownloadProgress,
  SystemAPI,
} from "../src/types/electron";

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

// Expose protected methods to renderer process
const llamaAPI: LlamaAPI = {
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

contextBridge.exposeInMainWorld("llama", llamaAPI);

const conversationAPI: ConversationAPI = {
  save: (conversation) =>
    ipcRenderer.invoke("conversations:save", conversation),
  load: (conversationId) =>
    ipcRenderer.invoke("conversations:load", conversationId),
  list: () => ipcRenderer.invoke("conversations:list"),
  delete: (conversationId) =>
    ipcRenderer.invoke("conversations:delete", conversationId),
  search: (query) => ipcRenderer.invoke("conversations:search", query),
};

contextBridge.exposeInMainWorld("conversations", conversationAPI);

// Settings API
interface AppSettings {
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

interface SettingsAPI {
  load: () => Promise<AppSettings | null>;
  save: (
    settings: AppSettings
  ) => Promise<{ success: boolean; error?: string }>;
}

interface SettingsPersistenceAPI {
  load: () => Promise<AppSettings>;
  save: (settings: AppSettings) => Promise<boolean>;
  export: (settings: AppSettings) => Promise<string | null>;
  import: () => Promise<AppSettings | null>;
  reset: () => Promise<AppSettings>;
}

interface ExportAPI {
  exportJSON: (conversation: Conversation) => Promise<boolean>;
  exportMarkdown: (conversation: Conversation) => Promise<boolean>;
  import: () => Promise<Conversation | null>;
}

interface WebSearchSettings {
  maxCacheSizeMB?: number;
  cacheExpiryHours?: number;
}

interface WebSearchAPI {
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

interface MCPAPI {
  initialize: () => Promise<{ success: boolean; error?: string }>;
  callTool: (request: MCPToolCall) => Promise<MCPToolResult>;
  listTools: (
    serverName: string
  ) => Promise<{ success: boolean; tools?: unknown[]; error?: string }>;
  getServerConfig: (
    serverName: string
  ) => Promise<{ success: boolean; config?: MCPServerConfig; error?: string }>;
  isReady: () => Promise<{ success: boolean; ready?: boolean; error?: string }>;
  audit: {
    query: (
      options?: AuditLogQueryOptions
    ) => Promise<{ success: boolean; logs?: AuditLogEntry[]; error?: string }>;
    stats: () => Promise<{
      success: boolean;
      stats?: {
        totalCalls: number;
        approvedCalls: number;
        deniedCalls: number;
        byServer: Record<string, number>;
        byTool: Record<string, number>;
      };
      error?: string;
    }>;
    export: (
      outputPath: string
    ) => Promise<{ success: boolean; error?: string }>;
    clear: () => Promise<{ success: boolean; error?: string }>;
  };
}

const settingsAPI: SettingsAPI = {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings) => ipcRenderer.invoke("settings:save", settings),
};

const settingsPersistenceAPI: SettingsPersistenceAPI = {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings) => ipcRenderer.invoke("settings:save", settings),
  export: (settings) => ipcRenderer.invoke("settings:export", settings),
  import: () => ipcRenderer.invoke("settings:import"),
  reset: () => ipcRenderer.invoke("settings:reset"),
};

const exportAPI: ExportAPI = {
  exportJSON: (conversation) =>
    ipcRenderer.invoke("conversation:export-json", conversation),
  exportMarkdown: (conversation) =>
    ipcRenderer.invoke("conversation:export-markdown", conversation),
  import: () => ipcRenderer.invoke("conversation:import"),
};

const webSearchAPI: WebSearchAPI = {
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

const mcpAPI: MCPAPI = {
  initialize: () => ipcRenderer.invoke("mcp:initialize"),
  callTool: (request) => ipcRenderer.invoke("mcp:call-tool", request),
  listTools: (serverName) => ipcRenderer.invoke("mcp:list-tools", serverName),
  getServerConfig: (serverName) =>
    ipcRenderer.invoke("mcp:get-server-config", serverName),
  isReady: () => ipcRenderer.invoke("mcp:is-ready"),
  audit: {
    query: (options) => ipcRenderer.invoke("mcp:audit-query", options),
    stats: () => ipcRenderer.invoke("mcp:audit-stats"),
    export: (outputPath) => ipcRenderer.invoke("mcp:audit-export", outputPath),
    clear: () => ipcRenderer.invoke("mcp:audit-clear"),
  },
};

const modelDownloadAPI: ModelDownloadAPI = {
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
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener("model:download-progress", handler);
    };
  },
};

const systemAPI: SystemAPI = {
  selectDirectory: () => ipcRenderer.invoke("system:select-directory"),
};

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
