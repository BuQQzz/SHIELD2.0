import type { SavedCapsule } from "../services/taskCapsule";
import type { RecommendedSampling } from "../services/modelSampling";
import type { NativeToolResult } from "./nativeTools";
import type { ToolDefinition } from "./prompts";
import type { Plan } from "../config/plan";
import type { AgentRunView } from "../agents/runView";
import type {
  RequestStatus,
  RescueAction,
} from "../services/llamaServer/rescue";
import type { GatewayPosture } from "../services/remote/remoteEndpoint";
import type {
  ProviderInput,
  ProviderSummary,
  ProviderTestResult,
} from "./providers";

export type { SavedCapsule };

export interface ModelConfig {
  /** Library model id (src/config/models.ts) */
  id: string;
  name: string;
  uri: string;
  contextSize?: number;
  /** The user chose to load despite a low-memory warning */
  allowLowMemory?: boolean;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  toolResults?: NativeToolResult[];
  thinking?: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  /** Older turns were summarised before this reply (see types/conversation) */
  summary?: string;
  /** That summary, to restore the model's view from */
  capsule?: SavedCapsule;
  /** SHIELD's record under a reply that claims a change never made (see types/conversation) */
  recordNote?: string;
}

/**
 * Chat is plain conversation; code is a session on a project folder, with
 * the file tools. Conversations from before the split have no kind: chat.
 */
export type ConversationKind = "chat" | "code";

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
  kind?: ConversationKind;
  /** A code session's project folder */
  folder?: string;
  /** The project this conversation runs under (see Project) */
  projectId?: string;
  /** A code session's live checklist (update_plan, or edited by the user) */
  plan?: Plan;
  /** A code session led by an orchestrator that delegates to sub-agents (src/agents) */
  team?: boolean;
  /** The model the user accepted the "not suited to a team" caution for */
  teamOverride?: string;
  /** What the team's agents did, for the Team panel after a restart */
  agentRuns?: AgentRunView[];
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
  kind?: ConversationKind;
  folder?: string;
  projectId?: string;
}

/**
 * A named group that chats and code sessions run under; with a folder,
 * its code sessions start there (electron/services/ProjectStorageService)
 */
export interface Project {
  id: string;
  name: string;
  folder?: string;
  createdAt: string;
  updatedAt: string;
}

/** How one reply was generated (mirrors LlamaService) */
export interface GenerationStats {
  outputTokens: number;
  tokensPerSecond: number;
  durationMs: number;
  /** For a hosted model: who answered, and whether it reported zero retention */
  servedBy?: { provider?: string; zdr?: boolean };
}

/** How full the model's context window is */
export interface ContextUsage {
  used: number;
  size: number;
}

/** Context sizes for a model and GPU layers each leaves (contextPlanner.ts) */
export interface ContextPlan {
  trainContextSize: number;
  totalLayers: number;
  options: { contextSize: number; gpuLayers: number; memory?: MemoryNeed }[];
  recommended: number;
  placement?: "layers" | "experts";
}

/** System memory a model needs (mirrors memoryCheck.ts) */
export interface MemoryNeed {
  ramBytes: number;
  commitBytes: number;
}

/** Why a model load was held back (mirrors memoryCheck.ts) */
export interface MemoryCheck {
  ok: boolean;
  need: MemoryNeed;
  free: { ramFreeBytes: number; commitFreeBytes?: number };
  problems: string[];
}

/** What is filling the context window (mirrors contextBreakdown.ts) */
export interface ContextBreakdown {
  used: number;
  size: number;
  total: number;
  dropped: number;
  trainContextSize: number;
  parts: {
    systemPrompt: number;
    toolInstructions: number;
    messages: number;
    toolResults: number;
    formatting: number;
  };
}

/** What a chat call returns, with the numbers shown in the UI */
export interface ChatResult {
  success: boolean;
  response?: string;
  error?: string;
  stats?: GenerationStats | null;
  context?: ContextUsage | null;
  /**
   * Set when the model's history was too full and its oldest turns were
   * replaced by this summary before the reply (llama-server only)
   */
  summary?: string | null;
  /** The same summary for the chat to save, so a restore need not redo it */
  capsule?: SavedCapsule | null;
  /**
   * For a hosted model: which provider answered and whether it reported zero
   * data retention. Null for a model that runs on this machine.
   */
  served?: GatewayPosture | null;
}

/** Remote providers: keys stay in the main process (electron/ipc/providerHandlers) */
export interface ProvidersAPI {
  list: () => Promise<{
    success: boolean;
    providers: ProviderSummary[];
    encryptionAvailable: boolean;
  }>;
  /** Without `apiKey` a saved provider keeps its key */
  save: (
    input: ProviderInput,
    apiKey?: string
  ) => Promise<{
    success: boolean;
    provider?: ProviderSummary;
    error?: string;
  }>;
  remove: (id: string) => Promise<{ success: boolean; error?: string }>;
  /** The provider's models, which also shows whether the saved key works */
  models: (id: string) => Promise<ProviderTestResult>;
  /**
   * Allow or stop allowing one model even though the provider reports no
   * zero-retention route for it (kept per model).
   */
  allowModel: (
    id: string,
    modelId: string,
    allowed: boolean
  ) => Promise<{
    success: boolean;
    provider?: ProviderSummary;
    error?: string;
  }>;
}

/**
 * One request as it runs (see ChatProgress in LlamaService). `contextUsed`
 * is how many tokens the window holds at that moment.
 */
export type ChatProgress =
  | { phase: "summarising" }
  | {
      phase: "reading";
      done: number;
      total: number;
      cached: number;
      contextUsed: number;
    }
  | {
      phase: "writing";
      generated: number;
      tokensPerSecond: number;
      contextUsed: number;
    };

export interface LlamaAPI {
  initialize: () => Promise<{ success: boolean; error?: string }>;
  /** `memory` without `error`: held back for lack of memory, not loaded */
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
  /** The sampling the model's file, else SHIELD's catalog, recommends */
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
  /** Summarising, reading and writing, as they happen */
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
  /** The request in progress (null when none), for the stuck bar */
  requestStatus: () => Promise<{
    success: boolean;
    status?: RequestStatus | null;
  }>;
  /** Nudge, skip or restart a request that looks stuck; false if none ran */
  rescue: (action: RescueAction) => Promise<{
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

export interface AppSettings {
  model: {
    temperature: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
    contextLength: number;
    maxTokens: number;
    speculativeDecoding: boolean;
  };
  system: {
    systemPrompt: string;
    autoSave: boolean;
    confirmDelete: boolean;
    theme: "light" | "dark" | "system";
  };
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  privacy: {
    // Privacy is built-in by design - no telemetry or analytics
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
    mode: "ask" | "auto" | "plan" | "readonly";
    allowedTools: string[];
    auditLogRetentionDays: number;
    maxToolCallsPerTurn: number;
    maxToolRounds: number;
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

/** A match from SHIELD's memory index (electron/services/memory) */
export interface MemoryHit {
  /** "<conversation id>#<message number>", what open_memory takes */
  id: string;
  conversationId: string;
  messageIndex: number;
  /** "record": SHIELD's record of what a session actually changed and ran */
  role: "user" | "assistant" | "tool" | "record";
  tool?: string;
  title: string;
  kind: "chat" | "code";
  folder?: string;
  projectId?: string;
  createdAt: number;
  snippet: string;
  score: number;
  matched: number;
}

export interface MCPToolResult {
  success: boolean;
  /** Plan mode declined to run the call - not a failure */
  blocked?: boolean;
  data?: unknown; // Changed from result to match backend
  error?: string;
  /**
   * A delegation whose agent changed a file or ran a command: what earlier
   * calls of the turn found may no longer hold
   */
  changed?: boolean;
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
  listServers: () => Promise<{
    success: boolean;
    servers?: string[];
    error?: string;
  }>;
  getServerConfig: (
    serverName: string
  ) => Promise<{ success: boolean; config?: MCPServerConfig; error?: string }>;
  isReady: () => Promise<{
    success: boolean;
    ready?: boolean;
    error?: string;
  }>;
  /** Folder picker; resolves to the chosen path, or null if cancelled */
  chooseWorkspace: () => Promise<string | null>;
  /** Restrict file tools to a folder, or null for the default folders */
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
    hits?: MemoryHit[];
    /** By conversation: changes its record shows were never made */
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
  /** GPU memory and system RAM in GB (vramGB null without a GPU) */
  getHardware: () => Promise<{
    success: boolean;
    hardware?: { vramGB: number | null; ramGB: number | null };
    error?: string;
  }>;
  onProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  setHfToken: (
    token: string | undefined
  ) => Promise<{ success: boolean; error?: string }>;
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
  onUpdateNotAvailable: (
    callback: (info: { version: string }) => void
  ) => () => void;
  onUpdateDownloading: (
    callback: (progress: UpdateProgress) => void
  ) => () => void;
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onUpdateError: (callback: (error: { message: string }) => void) => () => void;
}

declare global {
  interface Window {
    llama: LlamaAPI;
    providers: ProvidersAPI;
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
