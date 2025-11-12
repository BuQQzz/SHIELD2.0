import {
  getLlama,
  Llama,
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
} from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";
import { generateConversationTitle } from "./titleGenerator.js";
import { loadModel, type ModelConfig } from "./llama/ModelLoader.js";
import { createContextWithFallback } from "./llama/ContextManager.js";
import {
  createSession,
  recreateSessionWithPrompt,
  applyChatHistory,
  clearChatHistory,
  type ChatMessage,
} from "./llama/SessionManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultModelsDir = path.join(__dirname, "..", "..", "models");

export type { ChatMessage, ModelConfig };

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

/**
 * Service for managing llama.cpp inference
 * Handles model loading, context management, and chat sessions
 */
export class LlamaService {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private session: LlamaChatSession | null = null;
  private currentModelConfig: ModelConfig | null = null;
  private currentAbortController: AbortController | null = null;
  private systemPrompt: string = "You are a helpful AI assistant.";
  private customModelsDir: string | undefined;

  /** Set custom models directory from settings */
  setCustomModelsDir(customPath: string | undefined): void {
    this.customModelsDir = customPath;
  }

  /** Get the current models directory (custom or default) */
  private getModelsDir(): string {
    return this.customModelsDir || defaultModelsDir;
  }

  /** Initialize llama.cpp */
  async initialize(): Promise<void> {
    if (this.llama) return;
    this.llama = await getLlama();
  }

  /** Set the system prompt - applies immediately by recreating session with history */
  async setSystemPrompt(prompt: string): Promise<void> {
    this.systemPrompt = prompt;
    if (this.context && this.session) {
      this.session = recreateSessionWithPrompt(
        this.session,
        this.context,
        this.systemPrompt
      );
    }
  }

  /** Get the current system prompt */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /** Load a model from Hugging Face URI */
  async loadModel(config: ModelConfig): Promise<{ warning?: string }> {
    if (!this.llama) {
      throw new Error("LlamaService not initialized. Call initialize() first");
    }

    // Check if model is already loaded
    if (
      this.currentModelConfig?.uri === config.uri &&
      this.model &&
      this.context &&
      this.session
    ) {
      return {};
    }

    // Clean up existing resources
    await this.cleanup();

    // Load model
    const modelsDir = this.getModelsDir();
    const { model, modelPath } = await loadModel(this.llama, {
      config,
      modelsDir,
    });
    this.model = model;

    // Create context with fallback
    const contextSize = config.contextSize || 2048;
    const contextResult = await createContextWithFallback({
      model: this.model,
      requestedContextSize: contextSize,
      modelPath,
    });

    this.context = contextResult.context;

    // Create chat session with system prompt
    this.session = createSession({
      context: this.context,
      systemPrompt: this.systemPrompt,
    });

    this.currentModelConfig = {
      ...config,
      contextSize: contextResult.actualContextSize,
    };

    return { warning: contextResult.warning };
  }

  /** Send a message and get a response */
  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    if (!this.session) {
      throw new Error("No model loaded. Call loadModel() first");
    }

    // Create abort controller for this request
    this.currentAbortController = new AbortController();
    const signal = options.signal || this.currentAbortController.signal;

    try {
      const response = await this.session.prompt(message, {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 512,
        topP: options.topP ?? 0.9,
        topK: options.topK ?? 40,
        repeatPenalty: options.repeatPenalty
          ? { penalty: options.repeatPenalty }
          : { penalty: 1.1 },
        onTextChunk: options.onToken
          ? (chunk: string) => options.onToken!(chunk)
          : undefined,
        signal,
      });

      return response;
    } finally {
      this.currentAbortController = null;
    }
  }

  /** Send a message with streaming response */
  async chatStreaming(
    message: string,
    onToken: (token: string) => void,
    options: Omit<ChatOptions, "onToken"> = {}
  ): Promise<string> {
    return this.chat(message, { ...options, onToken });
  }

  /** Get chat history (managed internally by LlamaChatSession) */
  getChatHistory(): ChatMessage[] {
    return [];
  }

  /** Set chat history from saved conversation */
  setChatHistory(messages: ChatMessage[]): void {
    if (this.session) {
      applyChatHistory(this.session, messages);
    }
  }

  /** Clear chat history */
  clearHistory(): void {
    if (this.session) {
      clearChatHistory(this.session);
    }
  }

  /** Apply updated system prompt - recreates session while preserving context */
  async applySystemPrompt(prompt: string): Promise<void> {
    this.systemPrompt = prompt;
    if (this.context) {
      this.session = createSession({
        context: this.context,
        systemPrompt: this.systemPrompt,
      });
    }
  }

  /** Stop the current generation */
  stopGeneration(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /** Get current model info */
  getModelInfo(): ModelConfig | null {
    return this.currentModelConfig;
  }

  /** Check if a model is loaded */
  isModelLoaded(): boolean {
    return (
      this.model !== null && this.context !== null && this.session !== null
    );
  }

  /** Clean up resources */
  async cleanup(): Promise<void> {
    this.session = null;
    this.context = null;
    if (this.model) {
      this.model = null;
    }
    this.currentModelConfig = null;
  }

  /** Generate conversation title from user's first message */
  async generateTitle(userMessage: string): Promise<string> {
    if (!this.session) {
      throw new Error("No active session");
    }
    return generateConversationTitle(this.session, userMessage);
  }

  /** Dispose of all resources */
  async dispose(): Promise<void> {
    await this.cleanup();
    this.llama = null;
  }
}

/**
 * Singleton instance
 */
let instance: LlamaService | null = null;

export function getLlamaService(): LlamaService {
  if (!instance) {
    instance = new LlamaService();
  }
  return instance;
}
