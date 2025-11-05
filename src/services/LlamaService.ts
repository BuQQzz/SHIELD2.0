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
import { generateConversationTitle } from "./titleGenerator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultModelsDir = path.join(__dirname, "..", "..", "models");

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
  private customModelsDir: string | undefined;

  /**
   * Set custom models directory from settings
   */
  setCustomModelsDir(customPath: string | undefined): void {
    this.customModelsDir = customPath;
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
  }

  /**
   * Set the system prompt for the AI assistant
   * Applies immediately by recreating the session while preserving chat history
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    this.systemPrompt = prompt;

    // Apply immediately if we have an active session
    if (this.context && this.session) {
      console.log(
        "[LlamaService] Applying new system prompt to existing session"
      );

      // Save current chat history
      const currentHistory = this.session.getChatHistory();

      // Recreate session with new system prompt
      this.session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt: this.systemPrompt,
      });

      // Restore chat history
      if (currentHistory && currentHistory.length > 0) {
        this.session.setChatHistory(currentHistory);
        console.log(
          "[LlamaService] Chat history preserved after system prompt update"
        );
      }
    }
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

    // Resolve and load model
    const modelsDir = this.getModelsDir();
    let modelPath: string;

    // Check if it's a custom local file (file:// URI) or Hugging Face URI
    if (config.uri.startsWith("file://")) {
      // Custom model: extract filename and build path
      const filename = config.uri.replace("file://", "");
      modelPath = path.join(modelsDir, filename);
      console.log(`[LlamaService] Loading custom model: ${modelPath}`);
    } else {
      // Standard Hugging Face model
      modelPath = await resolveModelFile(config.uri, modelsDir);
      console.log(`[LlamaService] Loading catalog model: ${modelPath}`);
    }

    // Load model - let llama.cpp auto-detect optimal GPU layers
    // It will automatically offload to RAM if needed
    this.model = await this.llama.loadModel({
      modelPath,
      // gpuLayers: "auto" allows llama.cpp to determine the best split
      // between GPU and CPU based on available VRAM
    });

    let contextSize = config.contextSize || 2048;
    let warning: string | undefined;

    // Try to create context with requested size, fallback if insufficient VRAM
    try {
      this.context = await this.model.createContext({
        contextSize,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Check if it's a VRAM-related error
      if (
        errorMsg.includes("too large") ||
        errorMsg.includes("VRAM") ||
        errorMsg.includes("memory")
      ) {
        console.warn(
          `[LlamaService] VRAM insufficient for context size ${contextSize}, trying reduced sizes...`
        );

        // Try progressively smaller context sizes
        const fallbackSizes = [16384, 8192, 4096, 2048, 1024, 512];
        let contextCreated = false;

        for (const fallbackSize of fallbackSizes) {
          if (fallbackSize >= contextSize) continue; // Skip if not smaller

          try {
            console.log(
              `[LlamaService] Attempting context size: ${fallbackSize}`
            );
            this.context = await this.model.createContext({
              contextSize: fallbackSize,
            });

            warning = `⚠️ Insufficient VRAM for requested context size (${contextSize}). Reduced to ${fallbackSize} tokens. This large model is using system RAM for some layers, which will be slower. For better performance, consider using a smaller model or upgrading your GPU.`;
            console.warn(`[LlamaService] ${warning}`);
            contextSize = fallbackSize;
            contextCreated = true;
            break;
          } catch {
            console.warn(
              `[LlamaService] Context size ${fallbackSize} also failed, trying smaller...`
            );
            continue;
          }
        }

        if (!contextCreated) {
          // If all fallbacks failed, throw a more helpful error
          throw new Error(
            `Unable to load this model even with minimum context size. The model (${path.basename(modelPath)}) requires more VRAM than available. Try a smaller quantization (e.g., Q4_K_S instead of Q4_K_M) or a smaller model.`
          );
        }
      } else {
        // Non-VRAM related error, rethrow
        throw error;
      }
    }

    // Ensure context was created
    if (!this.context) {
      throw new Error("Failed to create context");
    }

    // Create chat session with system prompt
    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      systemPrompt: this.systemPrompt,
    });

    this.currentModelConfig = { ...config, contextSize };

    return { warning };
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
   * Preserves the current system prompt
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
      console.log(
        "[LlamaService] Chat history set, system prompt preserved:",
        this.systemPrompt.substring(0, 100)
      );
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

    return generateConversationTitle(this.session, userMessage);
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
