export interface ModelSettings {
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  contextLength: number;
  maxTokens: number;
}

export interface SystemSettings {
  systemPrompt: string;
  autoSave: boolean;
  confirmDelete: boolean;
  theme: "light" | "dark" | "system";
}

export interface PrivacySettings {
  telemetry: boolean;
  analytics: boolean;
}

export interface WebSearchSettings {
  enabled: boolean;
  maxResults: number;
  cacheEnabled: boolean;
  cacheTTL: number; // in minutes
  provider: "duckduckgo";
}

export interface AppSettings {
  model: ModelSettings;
  system: SystemSettings;
  privacy: PrivacySettings;
  webSearch: WebSearchSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
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
  },
  privacy: {
    telemetry: false,
    analytics: false,
  },
  webSearch: {
    enabled: false,
    maxResults: 5,
    cacheEnabled: true,
    cacheTTL: 1440, // 24 hours in minutes
    provider: "duckduckgo",
  },
};
