/**
 * Settings Categories and Defaults
 *
 * This module defines the settings structure and default values for all
 * settings categories in SHIELD 2.0.
 */

/**
 * How much autonomy MCP tool calls are granted.
 *
 * - ask      every tool call prompts (default)
 * - auto     reads run immediately, mutating tools still prompt
 * - plan     the model states what it intends to do, nothing executes
 * - readonly mutating tools are not even offered to the model
 */
export type PermissionMode = "ask" | "auto" | "plan" | "readonly";

export const PERMISSION_MODES: readonly PermissionMode[] = [
  "ask",
  "auto",
  "plan",
  "readonly",
] as const;

export interface Settings {
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
    modelDirectory?: string;
    huggingFaceToken?: string; // HuggingFace API token for gated models
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
    /** How much autonomy tool calls get this turn */
    mode: PermissionMode;
    allowedTools: string[];
    auditLogRetentionDays: number;
    /** Max tool calls executed in a single round */
    maxToolCallsPerTurn: number;
    /** Max tool -> result -> tool cycles in a single turn */
    maxToolRounds: number;
    /** Folder file tools may use; unset means Documents and Desktop */
    workspaceFolder?: string;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  model: {
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1,
    contextLength: 4096,
    maxTokens: 2048,
  },
  system: {
    systemPrompt: "You are a helpful AI assistant.",
    autoSave: true,
    confirmDelete: true,
    theme: "system",
    modelDirectory: undefined, // Use default (userData/models)
    huggingFaceToken: undefined, // HuggingFace API token
  },
  privacy: {
    telemetry: false,
    analytics: false,
  },
  webSearch: {
    enabled: false,
    maxResults: 5,
    cacheEnabled: true,
    cacheTTL: 1440,
    provider: "duckduckgo",
    showReasoning: false,
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
