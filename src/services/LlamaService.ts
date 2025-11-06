import { getLlama, Llama, LlamaModel, LlamaContext } from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";
import { generateConversationTitle } from "./titleGenerator.js";
import { LlamaModelLoader, ModelConfig } from "./LlamaModelLoader.js";
import { LlamaContextManager } from "./LlamaContextManager.js";
import {
  LlamaSessionManager,
  ChatMessage,
} from "./LlamaSessionManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultModelsDir = path.join(__dirname, "..", "..", "models");

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

// Re-export types for backward compatibility
export type { ChatMessage, ModelConfig }

/**
 * Service for managing llama.cpp inference
 * Orchestrates model loading, context management, and chat sessions
 */
export class LlamaService {
  private llama: Llama | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private currentModelConfig: ModelConfig | null = null;
  private currentAbortController: AbortController | null = null;
  private customModelsDir: string | undefined;

  private modelLoader: LlamaModelLoader | null = null;
  private contextManager: LlamaContextManager;
  private sessionManager: LlamaSessionManager;

  constructor() {
    this.contextManager = new LlamaContextManager();
    this.sessionManager = new LlamaSessionManager();
  }

  /**
   * Set custom models directory from settings
   */
  setCustomModelsDir(customPath: string | undefined): void {
    this.customModelsDir = customPath;
    if (this.modelLoader) {
      this.modelLoader.setModelsDir(this.getModelsDir());
    }
  }

  /**
   * Get the current models directory (custom or default)
   */
  private getModelsDir(): string {
    return this.customModelsDir || defaultModelsDir;
  }

  /**
   * Initialize llama.cpp
   */
  async initialize(): Promise<void> {
    if (this.llama) return;
    this.llama = await getLlama();
    this.modelLoader = new LlamaModelLoader(this.llama, this.getModelsDir());
  }

  /**
   * Set the system prompt for the AI assistant
   * Applies immediately by recreating the session while preserving chat history
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    this.sessionManager.setSystemPrompt(prompt, this.context);
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string {
    return this.sessionManager.getSystemPrompt();
  }

  /**
   * Load a model from Hugging Face URI
   */
  async loadModel(config: ModelConfig): Promise<{ warning?: string }> {
    if (!this.llama || !this.modelLoader) {
      throw new Error("LlamaService not initialized. Call initialize() first");
    }

    // Check if model is already loaded
    if (
      this.currentModelConfig?.uri === config.uri &&
      this.model &&
      this.context &&
      this.sessionManager.getSession()
    ) {
      return {};
    }

    // Clean up existing resources
    await this.cleanup();

    // Load model using ModelLoader
    const { model } = await this.modelLoader.loadModel(config);
    this.model = model;

    // Create context using ContextManager
    const contextSize = config.contextSize || 2048;
    const contextResult = await this.contextManager.createContext(
      this.model,
      contextSize
    );
    this.context = contextResult.context;

    // Create chat session using SessionManager
    this.sessionManager.createSession(this.context);

    this.currentModelConfig = {
      ...config,
      contextSize: contextResult.actualContextSize,
    };

    return { warning: contextResult.warning };
  }

  /**
   * Send a message and get a response
   */
  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    const session = this.sessionManager.getSession();
    if (!session) {
      throw new Error("No model loaded. Call loadModel() first");
    }

    // Create abort controller for this request
    this.currentAbortController = new AbortController();
    const signal = options.signal || this.currentAbortController.signal;

    try {
      const response = await session.prompt(message, {
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

  /**
   * Send a message with streaming response
   */
  async chatStreaming(
    message: string,
    onToken: (token: string) => void,
    options: Omit<ChatOptions, "onToken"> = {}
  ): Promise<string> {
    return this.chat(message, {
      ...options,
      onToken,
    });
  }

  /**
   * Get chat history (simplified for now)
   */
  getChatHistory(): ChatMessage[] {
    // Chat history is managed internally by LlamaChatSession
    // For now, return empty array - history is preserved in session
    return [];
  }

  /**
   * Set chat history from saved conversation
   * Preserves the current system prompt
   */
  setChatHistory(messages: ChatMessage[]): void {
    this.sessionManager.setChatHistory(messages);
  }

  /**
   * Clear chat history
   */
  clearHistory(): void {
    this.sessionManager.clearHistory();
  }

  /**
   * Apply updated system prompt to current session
   * Recreates the chat session with new system prompt while preserving context
   */
  async applySystemPrompt(prompt: string): Promise<void> {
    this.sessionManager.setSystemPrompt(prompt, this.context);
  }

  /**
   * Stop the current generation
   */
  stopGeneration(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * Get current model info
   */
  getModelInfo(): ModelConfig | null {
    return this.currentModelConfig;
  }

  /**
   * Check if a model is loaded
   */
  isModelLoaded(): boolean {
    return (
      this.model !== null &&
      this.context !== null &&
      this.sessionManager.getSession() !== null
    );
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.sessionManager.clearSession();
    this.context = null;

    if (this.model) {
      this.model = null;
    }

    this.currentModelConfig = null;
  }

  /**
   * Generate a short, descriptive title for a conversation based on the user's first message
   */
  async generateTitle(userMessage: string): Promise<string> {
    const session = this.sessionManager.getSession();
    if (!session) {
      throw new Error("No active session");
    }

    return generateConversationTitle(session, userMessage);
  }

  /**
   * Dispose of all resources
   */
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
