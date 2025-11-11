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
    enabled: false,
    allowedServers: ["filesystem"],
    showPermissionDialog: true,
    rememberChoices: false,
    auditLogRetentionDays: 30,
  },
};
