import {
  getLlama,
  Llama,
  LlamaModel,
  LlamaContext,
  LlamaChatSession,
  resolveChatWrapper,
  InputLookupTokenPredictor,
  LlamaText,
  type ChatHistoryItem,
} from "node-llama-cpp";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  getModelById,
  isRuntimeAvailable,
  type HardwareInfo,
} from "../config/models.js";
import { chooseInstalledFile, findGgufFiles } from "./modelFiles.js";
import { planContext, type ContextPlan } from "./contextPlanner.js";
import { generateConversationTitle } from "./titleGenerator.js";
import {
  breakDownContext,
  type ContextBreakdown,
  type HistoryItem,
} from "./contextBreakdown.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultModelsDir = path.join(__dirname, "..", "..", "models");

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** How one reply was generated - shown under the message */
export interface GenerationStats {
  outputTokens: number;
  /** Decode speed: output tokens over the time from first to last token */
  tokensPerSecond: number;
  /** Whole reply, including prompt processing before the first token */
  durationMs: number;
}

/** How full the model's context window is */
export interface ContextUsage {
  used: number;
  size: number;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  onToken?: (token: string) => void;
  /** What the engine is doing, as it happens: for the chat's live status */
  onProgress?: (progress: ChatProgress) => void;
  signal?: AbortSignal;
}

/**
 * One request as it runs. `contextUsed` is how many tokens the window
 * holds at that moment, so the context ring can follow along.
 */
export type ChatProgress =
  /** The history was too full: the model is summarising older turns */
  | { phase: "summarising" }
  /** Reading the prompt (llama-server); `done` includes the `cached` part */
  | {
      phase: "reading";
      done: number;
      total: number;
      cached: number;
      contextUsed: number;
    }
  /** Generating: thinking or the reply itself */
  | {
      phase: "writing";
      generated: number;
      tokensPerSecond: number;
      contextUsed: number;
    };

export interface ModelConfig {
  /** Library model id (src/config/models.ts) */
  id: string;
  name: string;
  uri: string;
  contextSize?: number;
  speculativeDecoding?: boolean; // Enable input lookup token prediction
  /** The user chose to load despite a low-memory warning */
  allowLowMemory?: boolean;
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
  private lastStats: GenerationStats | null = null;
  private systemPrompt: string = "You are a helpful AI assistant.";
  private customModelsDir: string | undefined;
  /** The user's context choice for the loaded model (undefined = auto) */
  private requestedContextSize: number | undefined;
  /** Per model file; reading GGUF insights takes a moment */
  private contextPlans = new Map<string, Promise<ContextPlan>>();

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

  /** The llama.cpp bindings, e.g. for reading GGUF insights */
  async getLlama(): Promise<Llama> {
    await this.initialize();
    if (!this.llama) throw new Error("LlamaService not initialized");
    return this.llama;
  }

  /**
   * GPU memory and system RAM in GB, for picking quantizations and
   * recommending models. VRAM is null when no GPU backend is available.
   */
  async getHardwareInfo(): Promise<HardwareInfo> {
    await this.initialize();
    const ramGB = os.totalmem() / 2 ** 30;
    if (!this.llama || this.llama.gpu === false) {
      return { vramGB: null, ramGB };
    }
    const { total } = await this.llama.getVramState();
    return { vramGB: total / 2 ** 30, ramGB };
  }

  /**
   * Set the system prompt for the AI assistant
   * Applies immediately by recreating the session while preserving chat history
   */
  async setSystemPrompt(prompt: string): Promise<void> {
    this.systemPrompt = prompt;

    // Apply immediately if we have an active session
    if (this.context && this.session && this.model) {
      // Save current chat history, minus the old system message - restoring it
      // verbatim would immediately overwrite the prompt we are setting here.
      const currentHistory = this.session
        .getChatHistory()
        .filter((item) => item.type !== "system");

      // Resolve chat wrapper from model to maintain correct template format
      const chatWrapper = resolveChatWrapper(this.model);

      // Recreate session with new system prompt
      this.session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        chatWrapper,
        systemPrompt: this.systemPrompt,
      });

      // Restore chat history re-anchored on the new system prompt
      if (currentHistory.length > 0) {
        this.session.setChatHistory([
          { type: "system", text: this.systemPrompt },
          ...currentHistory,
        ]);
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
   * Load a library model. `config.contextSize` is the user's choice for
   * this model; without one the context plan's recommendation is used.
   */
  async loadModel(config: ModelConfig): Promise<{ warning?: string }> {
    if (!this.llama) {
      throw new Error("LlamaService not initialized. Call initialize() first");
    }

    // Already loaded with the same context choice
    if (
      this.currentModelConfig?.uri === config.uri &&
      this.requestedContextSize === config.contextSize &&
      this.model &&
      this.context &&
      this.session
    ) {
      return {};
    }

    // Clean up existing resources
    await this.cleanup();

    const modelPath = await this.resolveModelPath(config.id);

    let contextSize =
      config.contextSize ?? (await this.planContextFor(modelPath)).recommended;
    this.requestedContextSize = config.contextSize;
    console.log(
      `[LlamaService] Context: ${contextSize} tokens (${config.contextSize ? "chosen" : "recommended"})`
    );

    // Split layers between VRAM and system RAM, leaving VRAM for the
    // requested context. Plain "auto" fills the GPU with layers first, so on
    // large models (Qwen3-Coder 30B on 12 GB) the context no longer fit and
    // was shrunk below - silently cutting the window that tool schemas and
    // tool results need. A few more layers in RAM is the better trade.
    this.model = await this.llama.loadModel({
      modelPath,
      gpuLayers: { fitContext: { contextSize } },
    });

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
        const fallbackSizes = [
          65536, 32768, 16384, 8192, 4096, 2048, 1024, 512,
        ];

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

    // Create context sequence with optional speculative decoding
    // InputLookupTokenPredictor speeds up generation for input-grounded tasks
    // (code modification, summarization, etc.) by predicting tokens from input
    const useSpeculativeDecoding = config.speculativeDecoding ?? true;
    const contextSequence = this.context.getSequence({
      tokenPredictor: useSpeculativeDecoding
        ? new InputLookupTokenPredictor({
            patternLength: { min: 2 },
            predictionLength: { max: 3 },
          })
        : undefined,
    });

    if (useSpeculativeDecoding) {
      console.log(
        "[LlamaService] Speculative decoding enabled (InputLookupTokenPredictor)"
      );
    }

    this.session = new LlamaChatSession({
      contextSequence,
      chatWrapper,
      systemPrompt: this.systemPrompt,
    });

    this.currentModelConfig = { ...config, contextSize };

    return { warning };
  }

  /**
   * Context sizes for an installed library model and how much of it each
   * leaves on the GPU, plus the recommended size.
   */
  async getContextPlan(modelId: string): Promise<ContextPlan> {
    await this.initialize();
    return this.planContextFor(await this.resolveModelPath(modelId));
  }

  private planContextFor(modelPath: string): Promise<ContextPlan> {
    let plan = this.contextPlans.get(modelPath);
    if (!plan) {
      const llama = this.llama;
      if (!llama) throw new Error("LlamaService not initialized");
      plan = llama
        .getVramState()
        .then(({ total }) => planContext(modelPath, llama, total))
        .then((result) => {
          const sizes = result.options
            .map(
              (o) =>
                `${o.contextSize / 1024}K ${o.gpuLayers}/${result.totalLayers}`
            )
            .join(", ");
          console.log(
            `[LlamaService] Context plan for ${path.basename(modelPath)} ` +
              `(${llama.gpu || "cpu"}): ${sizes} -> ${result.recommended / 1024}K`
          );
          return result;
        });
      // A failed read should not stick
      plan.catch(() => this.contextPlans.delete(modelPath));
      this.contextPlans.set(modelPath, plan);
    }
    return plan;
  }

  /**
   * Find the file to load for a library model. Loading never downloads -
   * that is an explicit choice in the model browser.
   */
  async resolveModelPath(modelId: string): Promise<string> {
    const model = getModelById(modelId);
    if (!model) {
      throw new Error(`Unknown model "${modelId}". Pick one from the library.`);
    }
    if (!isRuntimeAvailable(model)) {
      throw new Error(
        `${model.displayName} needs a runtime SHIELD does not support yet.`
      );
    }

    const modelsDir = this.getModelsDir();
    const { vramGB } = await this.getHardwareInfo();
    const chosen = chooseInstalledFile(
      model,
      await findGgufFiles(modelsDir),
      vramGB
    );
    if (!chosen) {
      throw new Error(
        `${model.displayName} is not installed in ${modelsDir}. Download it from Browse & Download Models.`
      );
    }
    console.log(`[LlamaService] Loading ${model.id} from ${chosen.path}`);
    return chosen.path;
  }

  /**
   * Send a message and get a response
   */
  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    console.log(
      "[LlamaService] Chat called with message:",
      message.substring(0, 50)
    );
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

    const sequence = this.session.sequence;
    const outputTokensBefore = sequence.tokenMeter.usedOutputTokens;
    const inputTokensBefore = sequence.tokenMeter.usedInputTokens;
    const startedAt = performance.now();
    let firstTokenAt: number | null = null;

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
        // No per-token logging: at 10-50 tokens/s it drowned the log
        onTextChunk: (chunk: string) => {
          firstTokenAt ??= performance.now();
          options.onToken?.(chunk);
          if (options.onProgress) {
            const generated =
              sequence.tokenMeter.usedOutputTokens - outputTokensBefore;
            const seconds = (performance.now() - firstTokenAt) / 1000;
            options.onProgress({
              phase: "writing",
              generated,
              tokensPerSecond: seconds > 0 ? generated / seconds : 0,
              contextUsed: sequence.nextTokenIndex,
            });
          }
        },
        signal,
      });

      const endedAt = performance.now();
      const outputTokens =
        sequence.tokenMeter.usedOutputTokens - outputTokensBefore;
      const decodeSeconds = (endedAt - (firstTokenAt ?? startedAt)) / 1000;
      this.lastStats = {
        outputTokens,
        tokensPerSecond: decodeSeconds > 0 ? outputTokens / decodeSeconds : 0,
        durationMs: endedAt - startedAt,
      };

      // Time before the first token is the model reading the prompt; with
      // part of a large model in system RAM it can run to minutes, which
      // looked like a hang (2026-09-23). Logged so it can be told apart.
      const readingSeconds = ((firstTokenAt ?? endedAt) - startedAt) / 1000;
      console.log(
        `[LlamaService] Inference complete: ${outputTokens} tokens, ` +
          `${this.lastStats.tokensPerSecond.toFixed(1)} tok/s, ` +
          `first token after ${readingSeconds.toFixed(1)}s, ` +
          `input ${sequence.tokenMeter.usedInputTokens - inputTokensBefore} tokens, ` +
          `context ${sequence.nextTokenIndex}/${sequence.contextSize}`
      );
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
      this.session.setChatHistory(this.buildSessionHistory(messages));
    }
  }

  /**
   * Convert our ChatMessage list into the session's history format.
   *
   * LlamaChatSession.setChatHistory REPLACES the whole history, so the system
   * message has to be re-supplied every time. Leaving it out silently strips
   * the system prompt - including the MCP tool instructions - from the model's
   * context, which makes the model answer that it has no tools.
   */
  private buildSessionHistory(messages: ChatMessage[]): ChatHistoryItem[] {
    const history: ChatHistoryItem[] = [
      { type: "system", text: this.systemPrompt },
    ];

    for (const msg of messages) {
      // The system prompt is already anchored above
      if (msg.role === "system") continue;

      if (msg.role === "user") {
        history.push({ type: "user", text: msg.content });
      } else {
        // assistant messages are "model" responses in llama.cpp
        history.push({ type: "model", response: [msg.content] });
      }
    }

    return history;
  }

  /**
   * Clear chat history
   */
  clearHistory(): void {
    if (this.session) {
      // Clear the conversation but keep the system prompt in place
      this.session.setChatHistory(this.buildSessionHistory([]));
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
  /** Stats for the most recent reply, or null before the first */
  getLastStats(): GenerationStats | null {
    return this.lastStats;
  }

  /**
   * Tokens the model sees, or null with no model. Derived from the same
   * breakdown as the context panel so the ring and the panel always agree.
   */
  getContextUsage(): ContextUsage | null {
    const breakdown = this.getContextBreakdown();
    return breakdown ? { used: breakdown.used, size: breakdown.size } : null;
  }

  /**
   * What is filling the context window, by kind. Tokenises the whole
   * session history, so it is computed on demand (when the user opens the
   * context panel), not after every reply.
   */
  getContextBreakdown(): ContextBreakdown | null {
    if (!this.session || !this.context || !this.model) return null;
    const model = this.model;
    const sequence = this.session.sequence;
    const chatHistory = this.session.getChatHistory();

    // Exactly what the next prompt would load, template tokens included
    const rendered = this.session.chatWrapper
      .generateContextState({ chatHistory })
      .contextText.tokenize(model.tokenizer).length;

    const history: HistoryItem[] = chatHistory.map((item): HistoryItem => {
      if (item.type === "system") {
        return {
          type: "system",
          text:
            typeof item.text === "string"
              ? item.text
              : LlamaText.fromJSON(item.text).toString(),
        };
      }
      if (item.type === "user") return { type: "user", text: item.text };
      return {
        type: "model",
        response: item.response.map((piece) =>
          typeof piece === "string"
            ? piece
            : {
                type: piece.type,
                text: "text" in piece ? String(piece.text) : undefined,
              }
        ),
      };
    });

    return breakDownContext(history, (text) => model.tokenize(text).length, {
      rendered,
      size: sequence.contextSize,
      trainContextSize: model.trainContextSize,
    });
  }

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
    const { context, model } = this;
    this.session = null;
    this.context = null;
    this.model = null;
    this.currentModelConfig = null;
    this.requestedContextSize = undefined;

    // Free VRAM now rather than at garbage collection: the next model, or
    // a llama-server taking over, needs it straight away. Separately, so a
    // context that fails to dispose does not leave the weights loaded.
    try {
      await context?.dispose();
    } catch (error) {
      console.warn("[LlamaService] Failed to free the context:", error);
    }
    try {
      await model?.dispose();
    } catch (error) {
      console.warn("[LlamaService] Failed to free the model:", error);
    }
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
