export interface ModelSettings {
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  contextLength: number;
  maxTokens: number;
  speculativeDecoding: boolean; // Use input lookup token prediction for faster inference
}

export interface SystemSettings {
  systemPrompt: string;
  autoSave: boolean;
  confirmDelete: boolean;
  theme: "light" | "dark" | "system";
  modelDirectory?: string; // Custom directory for model storage
  huggingFaceToken?: string; // HuggingFace API token for gated models (stored securely)
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PrivacySettings {
  // Privacy is built-in by design - no telemetry or analytics
}

export interface WebSearchSettings {
  enabled: boolean;
  maxResults: number;
  cacheEnabled: boolean;
  cacheTTL: number; // in minutes
  provider: "duckduckgo";
  showReasoning: boolean; // Show LLM's step-by-step reasoning for web search answers
}

/**
 * How much autonomy MCP tool calls are granted.
 *
 * - ask      every tool call prompts (default)
 * - auto     reads run immediately, mutating tools still prompt
 * - plan     the model states what it intends to do, nothing executes
 * - readonly mutating tools are not even offered to the model
 */
export type PermissionMode = "ask" | "auto" | "plan" | "readonly";

export interface MCPSettings {
  enabled: boolean;
  /** How much autonomy tool calls get this turn */
  mode: PermissionMode;
  allowedTools: string[];
  auditLogRetentionDays: number;
  /** Max tool calls executed in a single round */
  maxToolCallsPerTurn: number;
  /** Max tool -> result -> tool cycles in a single turn */
  maxToolRounds: number;
  /**
   * Folder file tools may use. Unset means the defaults (Documents and
   * Desktop). Chosen from the folder chip next to the composer.
   */
  workspaceFolder?: string;
}

export interface AppSettings {
  model: ModelSettings;
  system: SystemSettings;
  privacy: PrivacySettings;
  webSearch: WebSearchSettings;
  mcp: MCPSettings;
}

// Import the default prompt from systemPrompts config
import { getDefaultSystemPrompt } from "../config/systemPrompts";

export const DEFAULT_SETTINGS: AppSettings = {
  model: {
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1,
    contextLength: 4096,
    maxTokens: 2048,
    speculativeDecoding: true, // Enabled by default for faster inference
  },
  system: {
    systemPrompt: getDefaultSystemPrompt(),
    autoSave: true,
    confirmDelete: true,
    theme: "system",
    modelDirectory: undefined, // Use default (userData/models)
    huggingFaceToken: undefined, // User's HuggingFace token
  },
  privacy: {
    // No settings needed - privacy is built-in by design
  },
  webSearch: {
    enabled: false,
    maxResults: 5,
    cacheEnabled: true,
    cacheTTL: 1440, // 24 hours in minutes
    provider: "duckduckgo",
    showReasoning: false, // Hidden by default for cleaner responses
  },
  mcp: {
    enabled: true,
    mode: "ask",
    allowedTools: ["read_file", "write_file", "list_directory"],
    auditLogRetentionDays: 30,
    maxToolCallsPerTurn: 5,
    maxToolRounds: 5,
  },
};
