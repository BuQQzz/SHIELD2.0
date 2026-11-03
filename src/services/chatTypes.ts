/**
 * The chat types every engine shares: a SHIELD-managed llama-server
 * (LlamaServerProvider) and a hosted model on the same harness.
 */

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
  /**
   * For a hosted model: which provider answered and whether it reported zero
   * data retention. Absent for a model that runs on this machine.
   */
  servedBy?: { provider?: string; zdr?: boolean };
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
  /**
   * false: a thinking model answers without thinking first. The team's
   * orchestrator only routes work, and thought made a greeting take 60 s.
   */
  thinking?: boolean;
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
  /** The user chose to load despite a low-memory warning */
  allowLowMemory?: boolean;
}
