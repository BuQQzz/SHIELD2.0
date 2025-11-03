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
}

declare global {
  interface Window {
    llama: LlamaAPI;
  }
}

export {};
