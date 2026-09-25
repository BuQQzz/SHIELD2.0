/**
 * Server-sent events from llama-server's /v1/chat/completions stream.
 *
 * Chunks arrive split at arbitrary points; this buffers partial lines and
 * returns each complete `data:` payload, parsed.
 */

import type { ChatProgress } from "../LlamaService.js";

export interface ChatStreamChunk {
  choices?: {
    delta?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
  /**
   * llama-server's own measurements: on the last chunk, and on every chunk
   * when the request sets `timings_per_token`
   */
  timings?: {
    prompt_n: number;
    prompt_ms: number;
    predicted_n: number;
    predicted_ms: number;
    predicted_per_second: number;
  };
  /**
   * While the prompt is read, with `return_progress`: once per batch.
   * `processed` includes the `cache`d tokens (checked 2026-09-25).
   */
  prompt_progress?: {
    total: number;
    cache: number;
    processed: number;
    time_ms: number;
  };
}

/**
 * What a chunk says about how far the request has got: reading the prompt
 * (`return_progress`) or generating (`timings_per_token`, which counts
 * thinking too). `promptTokens` is the prompt's length from the last
 * reading report. Null for a chunk that says neither.
 */
export function chunkProgress(
  chunk: ChatStreamChunk,
  promptTokens: number
): ChatProgress | null {
  const reading = chunk.prompt_progress;
  if (reading) {
    return {
      phase: "reading",
      done: reading.processed,
      total: reading.total,
      cached: reading.cache,
      contextUsed: reading.processed,
    };
  }
  const generated = chunk.timings?.predicted_n ?? 0;
  if (generated > 0) {
    return {
      phase: "writing",
      generated,
      tokensPerSecond: chunk.timings?.predicted_per_second ?? 0,
      contextUsed: promptTokens + generated,
    };
  }
  return null;
}

export class SseParser {
  private buffer = "";

  /** Feed raw text; returns the chunks completed by it */
  push(text: string): ChatStreamChunk[] {
    this.buffer += text;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? "";

    const chunks: ChatStreamChunk[] = [];
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        chunks.push(JSON.parse(payload) as ChatStreamChunk);
      } catch {
        // A malformed event is skipped rather than ending the reply
      }
    }
    return chunks;
  }
}
