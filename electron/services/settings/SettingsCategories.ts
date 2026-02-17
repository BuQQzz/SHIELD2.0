/**
 * Settings Categories and Defaults
 *
 * This module defines the settings structure and default values for all
 * settings categories in SHIELD 2.0.
 */

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
    allowedServers: string[];
    allowedTools: string[];
    showPermissionDialog: boolean;
    rememberChoices: boolean;
    auditLogRetentionDays: number;
    hybridParserEnabled: boolean;
    maxToolCallsPerTurn: number;
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
    allowedServers: ["filesystem"],
    allowedTools: ["read_file", "write_file", "list_directory"],
    showPermissionDialog: true,
    rememberChoices: false,
    auditLogRetentionDays: 30,
    hybridParserEnabled: true,
    maxToolCallsPerTurn: 5,
  },
};
