export interface ModelConfig {
  name: string;
  uri: string;
  contextSize?: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
}

export interface ConversationMetadata {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
}

export interface LlamaAPI {
  initialize: () => Promise<{ success: boolean; error?: string }>;
  loadModel: (
    config: ModelConfig
  ) => Promise<{ success: boolean; error?: string; warning?: string }>;
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
    theme: "light" | "dark" | "system";
  };
  privacy: {
    telemetry: boolean;
    analytics: boolean;
  };
  webSearch: {
    enabled: boolean;
    maxResults: number;
    cacheEnabled: boolean;
    cacheTTL: number;
    provider: "duckduckgo";
    showReasoning: boolean;
  };
  mcp: {
    enabled: boolean;
    allowedServers: string[];
    showPermissionDialog: boolean;
    rememberChoices: boolean;
    auditLogRetentionDays: number;
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

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface PageContent {
  url: string;
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline?: string;
  length: number;
  fetchedAt: Date;
  metadata: {
    domain: string;
    contentType?: string;
    language?: string;
  };
}

export interface PrivacyOptions {
  userAgent?: string;
  timeout?: number;
  blockTrackers?: boolean;
  useRandomUA?: boolean;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

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

// MCP Types
export interface MCPToolCall {
  serverName: string;
  tool: string; // Changed from toolName to match backend
  arguments?: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  data?: unknown; // Changed from result to match backend
  error?: string;
}

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  allowedPaths?: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  serverName: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  approved: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
}

export interface AuditLogQueryOptions {
  serverName?: string;
  toolName?: string;
  startDate?: Date;
  endDate?: Date;
  approved?: boolean;
  limit?: number;
  offset?: number;
}

export interface MCPAPI {
  initialize: () => Promise<{ success: boolean; error?: string }>;
  callTool: (request: MCPToolCall) => Promise<MCPToolResult>;
  listTools: (
    serverName: string
  ) => Promise<{ success: boolean; tools?: unknown[]; error?: string }>;
  getServerConfig: (
    serverName: string
  ) => Promise<{ success: boolean; config?: MCPServerConfig; error?: string }>;
  isReady: () => Promise<{
    success: boolean;
    ready?: boolean;
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
    export: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    clear: () => Promise<{ success: boolean; error?: string }>;
  };
}

// Model Download Types
export interface DownloadProgress {
  modelId: string;
  status: "downloading" | "completed" | "error" | "cancelled";
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  error?: string;
}

export interface ModelDownloadAPI {
  download: (
    modelId: string
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  cancel: (modelId: string) => Promise<{ success: boolean; error?: string }>;
  getProgress: (modelId: string) => Promise<{
    success: boolean;
    progress?: DownloadProgress | null;
    error?: string;
  }>;
  getActiveDownloads: () => Promise<string[]>;
  listInstalled: () => Promise<{
    success: boolean;
    models?: string[];
    error?: string;
  }>;
  isInstalled: (
    modelId: string
  ) => Promise<{ success: boolean; installed?: boolean; error?: string }>;
  delete: (modelId: string) => Promise<{ success: boolean; error?: string }>;
  getDiskSpace: () => Promise<{
    success: boolean;
    bytes?: number;
    error?: string;
  }>;
  onProgress: (callback: (progress: DownloadProgress) => void) => () => void;
}

export interface SystemAPI {
  selectDirectory: () => Promise<string | null>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
}

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string | null;
}

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface AutoUpdateAPI {
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  getAppVersion: () => Promise<string>;
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => () => void;
  onUpdateDownloading: (callback: (progress: UpdateProgress) => void) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;
}

declare global {
  interface Window {
    llama: LlamaAPI;
    conversations: ConversationAPI;
    electronAPI: {
      settings: SettingsAPI;
      settingsPersistence: SettingsPersistenceAPI;
      export: ExportAPI;
      webSearch: WebSearchAPI;
      mcp: MCPAPI;
      modelDownload: ModelDownloadAPI;
      system: SystemAPI;
      autoUpdate: AutoUpdateAPI;
    };
    _mcpToolResolve?: (result: MCPToolResult) => void;
  }
}

export {};
