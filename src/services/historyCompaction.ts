/**
 * History Compaction
 *
 * Clears the bulk out of older tool calls in the model's chat history: the
 * file content an old write_file carried, the file an old read returned.
 * The record of what happened stays - "wrote server.js", "read app.js" - so
 * the model still knows its own steps; if it needs a cleared file again it
 * reads it again.
 *
 * Why: a long agent turn in the Searcher project filled Qwen3-Coder's 32k
 * window, and 96% of it was file contents from earlier steps (14k tokens of
 * whole files written, 16k of files read). The model started repeating
 * itself, confusing files and editing from memory (2026-09-24).
 *
 * Only the model's copy is compacted. The conversation shown and saved in
 * the UI keeps everything.
 */

import { extractToolCalls } from "../handlers/toolCallParsing.js";

export interface HistoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
}

/** A tool call or result shorter than this is left alone */
const KEEP_BELOW = 400;
/** Argument strings longer than this are cleared */
const LONG_STRING = 200;

const cleared = (chars: number) =>
  `[${chars.toLocaleString("en-US")} characters, cleared to save space]`;

/** Clear long strings in a call's arguments, keeping short ones (paths) */
function shrinkValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > LONG_STRING ? cleared(value.length) : value;
  }
  if (Array.isArray(value)) return value.map(shrinkValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, shrinkValue(v)])
    );
  }
  return value;
}

function compactCall(block: string): string {
  if (block.length < KEEP_BELOW) return block;
  const [call] = extractToolCalls(block);
  if (!call || call.argumentsError) {
    // Unreadable anyway; keep the frame, drop the bulk
    return block.replace(
      /<arguments>[\s\S]*?(<\/arguments>|(?=<\/tool_call>))/,
      () => `<arguments>{"note":"${cleared(block.length)}"}</arguments>`
    );
  }
  return [
    "<tool_call>",
    `<server>${call.serverName}</server>`,
    `<tool>${call.tool}</tool>`,
    `<arguments>${JSON.stringify(shrinkValue(call.arguments))}</arguments>`,
    "</tool_call>",
  ].join("\n");
}

function compactAssistant(content: string): string {
  let out = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, compactCall);

  // A call the reply was cut off in the middle of (it never ran)
  const CLOSE = "</tool_call>";
  const lastClose = out.lastIndexOf(CLOSE);
  const openAfter = out.indexOf(
    "<tool_call>",
    lastClose === -1 ? 0 : lastClose + CLOSE.length
  );
  if (openAfter !== -1 && out.length - openAfter > KEEP_BELOW) {
    out =
      out.slice(0, openAfter) +
      `[An unfinished tool call (${cleared(out.length - openAfter)}) that never ran]`;
  }
  return out;
}

function compactResults(content: string): string {
  return content.replace(
    /<result>([\s\S]*?)<\/result>/g,
    (whole: string, body: string) =>
      body.length < KEEP_BELOW
        ? whole
        : `<result>\n${cleared(body.length)} Run the tool again if you need this.\n</result>`
  );
}

/**
 * Compact every entry except the last `keepRecent`, which the model is
 * still working from. Idempotent: compacted entries are short enough to be
 * left alone next time, so the history only changes when there is new bulk.
 */
export function compactHistory(
  history: HistoryEntry[],
  keepRecent: number
): { history: HistoryEntry[]; savedChars: number } {
  const cutoff = Math.max(0, history.length - keepRecent);
  let savedChars = 0;

  const compacted = history.map((entry, i) => {
    if (i >= cutoff || entry.role === "system") return entry;
    const content =
      entry.role === "assistant"
        ? compactAssistant(entry.content)
        : compactResults(entry.content);
    savedChars += entry.content.length - content.length;
    return content === entry.content ? entry : { ...entry, content };
  });

  return { history: compacted, savedChars };
}

/**
 * Whether the next request should compact first: the prompt is estimated
 * to pass `limit` of the window, leaving the rest for the reply.
 */
export function shouldCompact(
  lastContextTokens: number,
  nextMessageChars: number,
  contextSize: number,
  limit = 0.6
): boolean {
  // ~3 characters per token for code-heavy text
  const estimate = lastContextTokens + nextMessageChars / 3;
  return contextSize > 0 && estimate > contextSize * limit;
}
