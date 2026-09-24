/**
 * Server-sent events from llama-server's /v1/chat/completions stream.
 *
 * Chunks arrive split at arbitrary points; this buffers partial lines and
 * returns each complete `data:` payload, parsed.
 */

export interface ChatStreamChunk {
  choices?: {
    delta?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
  /** llama-server's own measurements, on the last chunk */
  timings?: {
    prompt_n: number;
    prompt_ms: number;
    predicted_n: number;
    predicted_ms: number;
    predicted_per_second: number;
  };
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
