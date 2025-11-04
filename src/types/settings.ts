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
  showReasoning: boolean; // Show LLM's step-by-step reasoning for web search answers
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
    systemPrompt: "You are SHIELD Assistant. When answering questions with web search results, you MUST use ONLY the information provided in those search results. DO NOT use your training data if it conflicts with search results. DO NOT make up information. If search results are provided, they are live data from the internet and override anything you learned during training. Always be truthful and acknowledge when information is limited. If you're unsure, say so.",
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
    showReasoning: false, // Hidden by default for cleaner responses
  },
};
