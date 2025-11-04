import {
  getLlama,
  Llama,
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
  resolveModelFile,
} from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, "..", "..", "models");

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  onToken?: (token: string) => void;
  signal?: AbortSignal;
}

export interface ModelConfig {
  name: string;
  uri: string;
  contextSize?: number;
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

  /**
   * Initialize llama.cpp
   */
  async initialize(): Promise<void> {
    if (this.llama) return;
    this.llama = await getLlama();
  }

  /**
   * Set the system prompt for the AI assistant
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    // Note: System prompt will be applied on next session creation or history reset
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Load a model from Hugging Face URI
   */
  async loadModel(config: ModelConfig): Promise<void> {
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
      return;
    }

    // Clean up existing resources
    await this.cleanup();

    // Resolve and load model
    const modelPath = await resolveModelFile(config.uri, modelsDir);

    this.model = await this.llama.loadModel({
      modelPath,
    });

    // Create context
    this.context = await this.model.createContext({
      contextSize: config.contextSize || 2048,
    });

    // Create chat session with system prompt
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      systemPrompt: this.systemPrompt,
    });

    this.currentModelConfig = config;
  }

  /**
   * Send a message and get a response
   */
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
   */
  setChatHistory(messages: ChatMessage[]): void {
    if (this.session) {
      // Convert our ChatMessage format to LlamaChatSession format
      const chatHistory = messages.map((msg) => {
        if (msg.role === "user") {
          return { type: "user" as const, text: msg.content };
        } else {
          // assistant messages are "model" responses in llama.cpp
          return { type: "model" as const, response: [msg.content] };
        }
      });
      this.session.setChatHistory(chatHistory);
    }
  }

  /**
   * Clear chat history
   */
  clearHistory(): void {
    if (this.session) {
      this.session.setChatHistory([]);
    }
  }

  /**
   * Apply updated system prompt to current session
   * Recreates the chat session with new system prompt while preserving context
   */
  async applySystemPrompt(prompt: string): Promise<void> {
    this.systemPrompt = prompt;

    if (this.context) {
      // Recreate session with new system prompt
      this.session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt: this.systemPrompt,
      });
    }
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
      this.model !== null && this.context !== null && this.session !== null
    );
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.session = null;
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
    if (!this.session) {
      throw new Error("No active session");
    }

    const titlePrompt = `Based on this user message, generate a short, concise title (max 6 words) that describes the topic or question. Only return the title, nothing else.

User message: "${userMessage}"

Title:`;

    try {
      const response = await this.session.prompt(titlePrompt, {
        temperature: 0.3, // Lower temperature for more focused titles
        maxTokens: 20,
      });

      // Clean up the response - remove quotes, trim, limit length
      let title = response.trim().replace(/^["']|["']$/g, "");

      // If title is too long, truncate intelligently
      const words = title.split(" ");
      if (words.length > 6) {
        title = words.slice(0, 6).join(" ") + "...";
      }

      return title || "New Chat";
    } catch (error) {
      console.error("[LlamaService] Failed to generate title:", error);
      return "New Chat";
    }
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
