import {
  getLlama,
  Llama,
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
  resolveModelFile,
  resolveChatWrapper,
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
    if (this.context && this.session && this.model) {
      // Save current chat history
      const currentHistory = this.session.getChatHistory();

      // Resolve chat wrapper from model to maintain correct template format
      const chatWrapper = resolveChatWrapper(this.model);

      // Recreate session with new system prompt
      this.session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        chatWrapper,
        systemPrompt: this.systemPrompt,
      });

      // Restore chat history
      if (currentHistory && currentHistory.length > 0) {
        this.session.setChatHistory(currentHistory);
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
    } else {
      // Standard Hugging Face model
      modelPath = await resolveModelFile(config.uri, modelsDir);
    }

    // Load model with automatic GPU layer offloading
    // "auto" tells llama.cpp to fit as many layers as possible in VRAM,
    // and automatically offload remaining layers to system RAM
    // This enables running large models (e.g., 32B) on GPUs with limited VRAM
    this.model = await this.llama.loadModel({
      modelPath,
      gpuLayers: "auto", // Automatically split between VRAM and RAM
    });

    let contextSize = config.contextSize || 2048;
    let warning: string | undefined;

    // Try to create context with requested size, fallback if insufficient VRAM
    let contextCreated = false;
    try {
      this.context = await this.model.createContext({
        contextSize,
      });
      contextCreated = true;
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

        for (const fallbackSize of fallbackSizes) {
          if (fallbackSize >= contextSize) continue; // Skip if not smaller

          try {
            this.context = await this.model.createContext({
              contextSize: fallbackSize,
            });

            warning = `⚠️ Insufficient VRAM for requested context size (${contextSize}). Reduced to ${fallbackSize} tokens. This large model is using system RAM for some layers, which will be slower. For better performance, consider using a smaller model or upgrading your GPU.`;
            console.warn(`[LlamaService] ${warning}`);
            contextSize = fallbackSize;
            contextCreated = true;
            break;
          } catch {
            continue;
          }
        }
      } else {
        // Non-VRAM related error, rethrow
        throw error;
      }
    }

    if (!contextCreated) {
      // If all fallbacks failed, throw a more helpful error
      throw new Error(
        `Unable to load this model even with minimum context size. The model (${path.basename(modelPath)}) requires more VRAM than available. Try:\n` +
        `1. A smaller quantization (e.g., Q4_K_S, Q3_K_M instead of Q4_K_M)\n` +
        `2. A smaller model (e.g., 7B instead of 32B)\n` +
        `3. Freeing up VRAM by closing other applications\n` +
        `4. Upgrading your GPU`
      );
    }

    // Ensure context was created
    if (!this.context) {
      throw new Error("Failed to create context");
    }

    // Create chat session with system prompt
    // Explicitly resolve chat wrapper from model's GGUF metadata to ensure
    // correct template format (Llama, Qwen, Mistral, etc.) is used
    const chatWrapper = resolveChatWrapper(this.model);

    this.session = new LlamaChatSession({
      contextSequence: this.context.getSequence(),
      chatWrapper,
      systemPrompt: this.systemPrompt,
    });

    this.currentModelConfig = { ...config, contextSize };

    return { warning };
  }

  /**
   * Send a message and get a response
   */
  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    console.log("[LlamaService] Chat called with message:", message.substring(0, 50));
    console.log("[LlamaService] Session exists:", !!this.session);
    console.log("[LlamaService] Model exists:", !!this.model);
    console.log("[LlamaService] Context exists:", !!this.context);

    if (!this.session) {
      console.error("[LlamaService] No session - model not loaded");
      throw new Error("No model loaded. Call loadModel() first");
    }

    // Create abort controller for this request
    this.currentAbortController = new AbortController();
    const signal = options.signal || this.currentAbortController.signal;

    try {
      console.log("[LlamaService] Starting inference...");
      const response = await this.session.prompt(message, {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 512,
        topP: options.topP ?? 0.9,
        topK: options.topK ?? 40,
        repeatPenalty: options.repeatPenalty
          ? { penalty: options.repeatPenalty }
          : { penalty: 1.1 },
        onTextChunk: options.onToken
          ? (chunk: string) => {
            console.log("[LlamaService] Token received:", chunk.substring(0, 20));
            options.onToken!(chunk);
          }
          : undefined,
        signal,
      });

      console.log("[LlamaService] Inference complete, response length:", response.length);
      return response;
    } catch (error) {
      console.error("[LlamaService] Chat error:", error);
      throw error;
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

    if (this.context && this.model) {
      // Resolve chat wrapper from model to maintain correct template format
      const chatWrapper = resolveChatWrapper(this.model);

      // Recreate session with new system prompt
      this.session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        chatWrapper,
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
