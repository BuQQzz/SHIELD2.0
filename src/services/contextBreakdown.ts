/**
 * Context Breakdown
 *
 * What is filling the model's context window, by kind - the numbers behind
 * the composer's context ring. Counts come from the model's own tokenizer
 * over the session history, so they are real token counts; whatever the
 * chat template adds around each turn is reported as "formatting".
 *
 * Pure (history + tokenizer in, numbers out) so it can be tested without a
 * model.
 */

export interface ContextParts {
  /** SHIELD's instructions, or the user's custom prompt */
  systemPrompt: number;
  /** Tool descriptions, call format and folder information */
  toolInstructions: number;
  /** What the user typed and what the model replied */
  messages: number;
  /** Tool output fed back to the model: file contents, listings, errors */
  toolResults: number;
  /** Chat-template tokens around each turn */
  formatting: number;
}

export interface ContextBreakdown {
  /** Tokens the model sees: the whole chat, or the window if it overflows */
  used: number;
  size: number;
  /** Tokens the whole chat takes, rendered with the chat template */
  total: number;
  /** Older content that no longer fits and is dropped first */
  dropped: number;
  /** The context length the model was trained for */
  trainContextSize: number;
  parts: ContextParts;
}

/** Minimal shape of node-llama-cpp's ChatHistoryItem that we read */
export type HistoryItem =
  | { type: "system"; text: string }
  | { type: "user"; text: string }
  | {
      type: "model";
      response: Array<string | { type: string; text?: string }>;
    };

/**
 * Where the tool part of SHIELD's system prompt starts. buildSystemPrompt
 * appends the tool modules last, each starting with one of these headings.
 */
const TOOL_SECTION_HEADINGS = [
  "## Tool Usage",
  "## 🔧 Available Tools",
  "## Plan Mode",
];

export function splitSystemPrompt(text: string): {
  base: string;
  tools: string;
} {
  const starts = TOOL_SECTION_HEADINGS.map((h) => text.indexOf(h)).filter(
    (i) => i >= 0
  );
  if (starts.length === 0) return { base: text, tools: "" };
  const at = Math.min(...starts);
  return { base: text.slice(0, at), tools: text.slice(at) };
}

/**
 * A user-role turn that carries tool output rather than something the user
 * typed: the continuation processMCPToolCalls sends, or a stored result.
 */
export function isToolResultTurn(text: string): boolean {
  const start = text.trimStart();
  return start.startsWith("You executed ") || start.startsWith("<tool_result");
}

export function breakDownContext(
  history: HistoryItem[],
  tokenize: (text: string) => number,
  window: {
    /**
     * The whole history rendered through the chat template and tokenised -
     * exactly what the next prompt would load. Not the sequence's evaluated
     * token count: that still holds the previous chat until the next reply,
     * which made a new chat show old context.
     */
    rendered: number;
    size: number;
    trainContextSize: number;
  }
): ContextBreakdown {
  const count = (text: string) => (text ? tokenize(text) : 0);
  const parts: ContextParts = {
    systemPrompt: 0,
    toolInstructions: 0,
    messages: 0,
    toolResults: 0,
    formatting: 0,
  };

  for (const item of history) {
    if (item.type === "system") {
      const { base, tools } = splitSystemPrompt(item.text);
      parts.systemPrompt += count(base);
      parts.toolInstructions += count(tools);
    } else if (item.type === "user") {
      if (isToolResultTurn(item.text)) parts.toolResults += count(item.text);
      else parts.messages += count(item.text);
    } else {
      for (const piece of item.response) {
        if (typeof piece === "string") parts.messages += count(piece);
        else if (typeof piece.text === "string")
          parts.messages += count(piece.text);
      }
    }
  }

  const counted =
    parts.systemPrompt +
    parts.toolInstructions +
    parts.messages +
    parts.toolResults;
  const total = Math.max(window.rendered, counted);
  parts.formatting = total - counted;

  return {
    used: Math.min(total, window.size),
    size: window.size,
    total,
    dropped: Math.max(0, total - window.size),
    trainContextSize: window.trainContextSize,
    parts,
  };
}
