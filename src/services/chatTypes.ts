/**
 * The chat types every engine shares: a SHIELD-managed llama-server
 * (LlamaServerProvider) and a hosted model on the same harness.
 */

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /**
   * An assistant reply's thinking. Sent back while its request is under way
   * (LlamaServerProvider.messages), then left out like the template does.
   */
  reasoning?: string;
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
  /**
   * For a hosted model with known prices: what this request cost in US
   * dollars, with any summary or title request made since the last one
   */
  cost?: number;
  /** The same at the provider's listed prices */
  listedCost?: number;
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
  /**
   * SHIELD's own resend after the thinking went round in circles: it is
   * not watched again. A hosted model may think anyway when asked not to,
   * and each resend was dropped the same way, with no end (GLM 5.3 Flash,
   * 2026-11-22). A loop now runs to the reply limit instead.
   */
  afterLoop?: boolean;
}

/**
 * One request as it runs. `contextUsed` is how many tokens the window
 * holds at that moment, so the context ring can follow along.
 */
export type ChatProgress =
  /** The history was too full: the model is summarising older turns */
  | { phase: "summarising" }
  /**
   * A hosted model has the request and has not written yet. It reports no
   * reading progress, and may think for minutes without streaming it: shown
   * as "Reading the conversation…" the whole time, it looked stuck
   * (2026-11-16). `afterTools`: it is looking at tool results.
   */
  | { phase: "waiting"; provider: string; afterTools: boolean; since: number }
  /** A hosted model's streamed thinking, about `thought` tokens so far */
  | { phase: "thinking"; thought: number; since: number }
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
