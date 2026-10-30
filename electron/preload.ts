import { contextBridge, ipcRenderer } from "electron";
import type { NativeToolResult } from "../src/types/nativeTools";
import type { ToolDefinition } from "../src/types/prompts";
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
  ChatProgress,
  ChatResult,
  ContextBreakdown,
  ContextPlan,
  ContextUsage,
  MemoryCheck,
  ProvidersAPI,
} from "../src/types/electron";
import type { RecommendedSampling } from "../src/services/modelSampling";

export interface ModelConfig {
  /** Library model id (src/config/models.ts) */
  id: string;
  name: string;
  uri: string;
  contextSize?: number;
  allowLowMemory?: boolean;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  toolResults?: NativeToolResult[];
  thinking?: boolean;
}

export interface LlamaAPI {
  initialize: () => Promise<{ success: boolean; error?: string }>;
  loadModel: (config: ModelConfig) => Promise<{
    success: boolean;
    error?: string;
    warning?: string;
    memory?: MemoryCheck;
  }>;
  chat: (message: string, options?: ChatOptions) => Promise<ChatResult>;
  chatStreaming: (
    message: string,
    options?: ChatOptions
  ) => Promise<ChatResult>;
  getContextUsage: () => Promise<{
    success: boolean;
    context?: ContextUsage | null;
  }>;
  getContextBreakdown: () => Promise<{
    success: boolean;
    breakdown?: ContextBreakdown | null;
    error?: string;
  }>;
  getRecommendedSampling: (modelId: string) => Promise<{
    success: boolean;
    sampling?: RecommendedSampling | null;
    error?: string;
  }>;
  getContextPlan: (modelId: string) => Promise<{
    success: boolean;
    plan?: ContextPlan;
    error?: string;
  }>;
  onToken: (callback: (token: string) => void) => () => void;
  onProgress: (callback: (progress: ChatProgress) => void) => () => void;
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
  /** Sub-agent sessions (agent teams): a chat of their own on the loaded model */
  /** Text a sub-agent's model is writing, as it streams (the Team panel) */
  onAgentToken: (
    callback: (event: { sessionId: string; token: string }) => void
  ) => () => void;
  agentOpen: (
    systemPrompt: string
  ) => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  agentChat: (
    sessionId: string,
    message: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
      thinking?: boolean;
    }
  ) => Promise<{ success: boolean; response?: string; error?: string }>;
  agentContext: (sessionId: string) => Promise<{
    success: boolean;
    used?: number;
    size?: number;
    error?: string;
  }>;
  agentClose: (
    sessionId: string
  ) => Promise<{ success: boolean; error?: string }>;
  stopGeneration: () => Promise<{ success: boolean; error?: string }>;
  requestStatus: () => Promise<{
    success: boolean;
    status?: {
      agent: boolean;
      phase: "summarising" | "reading" | "writing";
      elapsedMs: number;
      idleMs: number;
    } | null;
  }>;
  rescue: (action: "nudge" | "skip" | "restart") => Promise<{
    success: boolean;
    cutOff?: boolean;
    error?: string;
  }>;
  setSystemPrompt: (
    prompt: string,
    tools?: ToolDefinition[]
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
  /** Put a saved conversation under a project, or out of any (null) */
  setProject: (
    conversationId: string,
    projectId: string | null
  ) => Promise<{ success: boolean; error?: string }>;
  listProjects: () => Promise<{ projects: Project[] }>;
  saveProject: (
    project: Project
  ) => Promise<{ success: boolean; project?: Project; error?: string }>;
  /** The project goes; its conversations stay, outside any project */
  deleteProject: (
    projectId: string
  ) => Promise<{ success: boolean; moved?: number; error?: string }>;
  /** A project folder's AGENTS.md, from the repository root down to it */
  projectInstructions: (
    folder: string
  ) => Promise<{ files: string[]; text: string; truncated: boolean }>;
  /** What SHIELD sees of a project, for drafting AGENTS.md */
  projectFacts: (folder: string) => Promise<string>;
}

interface Project {
  id: string;
  name: string;
  folder?: string;
  createdAt: string;
  updatedAt: string;
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
  onProgress: (callback) => {
    const subscription = (
      _event: Electron.IpcRendererEvent,
      progress: ChatProgress
    ) => callback(progress);
    ipcRenderer.on("llama:progress", subscription);
    return () => ipcRenderer.removeListener("llama:progress", subscription);
  },
  getContextUsage: () => ipcRenderer.invoke("llama:getContextUsage"),
  getContextBreakdown: () => ipcRenderer.invoke("llama:getContextBreakdown"),
  getRecommendedSampling: (modelId) =>
    ipcRenderer.invoke("llama:getRecommendedSampling", modelId),
  getContextPlan: (modelId) =>
    ipcRenderer.invoke("llama:getContextPlan", modelId),
  getModelInfo: () => ipcRenderer.invoke("llama:getModelInfo"),
  isModelLoaded: () => ipcRenderer.invoke("llama:isModelLoaded"),
  clearHistory: () => ipcRenderer.invoke("llama:clearHistory"),
  setChatHistory: (messages) =>
    ipcRenderer.invoke("llama:setChatHistory", messages),
  onAgentToken: (callback) => {
    const subscription = (
      _event: Electron.IpcRendererEvent,
      payload: { sessionId: string; token: string }
    ) => callback(payload);
    ipcRenderer.on("llama:agentToken", subscription);
    return () => ipcRenderer.removeListener("llama:agentToken", subscription);
  },
  agentOpen: (systemPrompt) =>
    ipcRenderer.invoke("llama:agentOpen", systemPrompt),
  agentChat: (sessionId, message, options) =>
    ipcRenderer.invoke("llama:agentChat", sessionId, message, options),
  agentContext: (sessionId) =>
    ipcRenderer.invoke("llama:agentContext", sessionId),
  agentClose: (sessionId) => ipcRenderer.invoke("llama:agentClose", sessionId),
  stopGeneration: () => ipcRenderer.invoke("llama:stopGeneration"),
  requestStatus: () => ipcRenderer.invoke("llama:requestStatus"),
  rescue: (action) => ipcRenderer.invoke("llama:rescue", action),
  setSystemPrompt: (prompt, tools) =>
    ipcRenderer.invoke("llama:setSystemPrompt", prompt, tools),
  getSystemPrompt: () => ipcRenderer.invoke("llama:getSystemPrompt"),
  generateTitle: (userMessage) =>
    ipcRenderer.invoke("llama:generateTitle", userMessage),
};

contextBridge.exposeInMainWorld("llama", llamaAPI);

const providersAPI: ProvidersAPI = {
  list: () => ipcRenderer.invoke("providers:list"),
  save: (input, apiKey) => ipcRenderer.invoke("providers:save", input, apiKey),
  remove: (id) => ipcRenderer.invoke("providers:remove", id),
  models: (id) => ipcRenderer.invoke("providers:models", id),
  allowModel: (id, modelId, allowed) =>
    ipcRenderer.invoke("providers:allow-model", id, modelId, allowed),
};

contextBridge.exposeInMainWorld("providers", providersAPI);

const conversationAPI: ConversationAPI = {
  save: (conversation) =>
    ipcRenderer.invoke("conversations:save", conversation),
  load: (conversationId) =>
    ipcRenderer.invoke("conversations:load", conversationId),
  list: () => ipcRenderer.invoke("conversations:list"),
  delete: (conversationId) =>
    ipcRenderer.invoke("conversations:delete", conversationId),
  search: (query) => ipcRenderer.invoke("conversations:search", query),
  setProject: (conversationId, projectId) =>
    ipcRenderer.invoke("conversations:set-project", conversationId, projectId),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  saveProject: (project) => ipcRenderer.invoke("projects:save", project),
  deleteProject: (projectId) =>
    ipcRenderer.invoke("projects:delete", projectId),
  projectInstructions: (folder) =>
    ipcRenderer.invoke("project:instructions", folder),
  projectFacts: (folder) => ipcRenderer.invoke("project:facts", folder),
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
  listServers: () => Promise<{
    success: boolean;
    servers?: string[];
    error?: string;
  }>;
  getServerConfig: (
    serverName: string
  ) => Promise<{ success: boolean; config?: MCPServerConfig; error?: string }>;
  isReady: () => Promise<{ success: boolean; ready?: boolean; error?: string }>;
  chooseWorkspace: () => Promise<string | null>;
  setWorkspace: (
    folder: string | null
  ) => Promise<{ success: boolean; folder?: string | null; error?: string }>;
  /** Ends any command run_command is running, and what it started */
  stopCommands: () => Promise<{ success: boolean; stopped?: number }>;
  /** SHIELD's memory of past conversations: the best matches for a message */
  searchMemory: (
    query: string,
    options?: {
      limit?: number;
      excludeConversation?: string;
      minMatched?: number;
      minShare?: number;
    }
  ) => Promise<{
    success: boolean;
    hits?: unknown[];
    notDone?: Record<string, string[]>;
    error?: string;
  }>;
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
  listServers: () => ipcRenderer.invoke("mcp:list-servers"),
  getServerConfig: (serverName) =>
    ipcRenderer.invoke("mcp:get-server-config", serverName),
  isReady: () => ipcRenderer.invoke("mcp:is-ready"),
  chooseWorkspace: () => ipcRenderer.invoke("mcp:choose-workspace"),
  setWorkspace: (folder) => ipcRenderer.invoke("mcp:set-workspace", folder),
  stopCommands: () => ipcRenderer.invoke("mcp:stop-commands"),
  searchMemory: (query, options) =>
    ipcRenderer.invoke("memory:search", query, options),
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
  getHardware: () => ipcRenderer.invoke("model:get-hardware"),
  onProgress: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: DownloadProgress
    ) => {
      console.log(
        "[preload] Download progress received:",
        progress.modelId,
        progress.status,
        progress.progress
      );
      callback(progress);
    };
    ipcRenderer.on("model:download-progress", handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener("model:download-progress", handler);
    };
  },
  setHfToken: (token) => ipcRenderer.invoke("model:set-hf-token", token),
};

const systemAPI: SystemAPI = {
  selectDirectory: () => ipcRenderer.invoke("system:select-directory"),
  openExternal: (url: string) =>
    ipcRenderer.invoke("system:open-external", url),
};

// Auto-update API
import type {
  AutoUpdateAPI,
  UpdateInfo,
  UpdateProgress,
} from "../src/types/electron";

const autoUpdateAPI: AutoUpdateAPI = {
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  onUpdateAvailable: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) =>
      callback(info);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },
  onUpdateNotAvailable: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: { version: string }
    ) => callback(info);
    ipcRenderer.on("update-not-available", handler);
    return () => ipcRenderer.removeListener("update-not-available", handler);
  },
  onUpdateDownloading: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: UpdateProgress
    ) => callback(progress);
    ipcRenderer.on("update-download-progress", handler);
    return () =>
      ipcRenderer.removeListener("update-download-progress", handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, info: UpdateInfo) =>
      callback(info);
    ipcRenderer.on("update-downloaded", handler);
    return () => ipcRenderer.removeListener("update-downloaded", handler);
  },
  onUpdateError: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      error: { message: string }
    ) => callback(error);
    ipcRenderer.on("update-error", handler);
    return () => ipcRenderer.removeListener("update-error", handler);
  },
};

contextBridge.exposeInMainWorld("electronAPI", {
  settings: settingsAPI,
  settingsPersistence: settingsPersistenceAPI,
  export: exportAPI,
  webSearch: webSearchAPI,
  mcp: mcpAPI,
  modelDownload: modelDownloadAPI,
  system: systemAPI,
  autoUpdate: autoUpdateAPI,
});

// Log that preload executed successfully
console.log(
  "[preload] window.llama, window.conversations, window.electronAPI (settings, export, webSearch, mcp, autoUpdate) exposed successfully"
);
