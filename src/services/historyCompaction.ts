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
/** Argument strings longer than this are removed */
const LONG_STRING = 200;

const chars = (n: number) => `${n.toLocaleString("en-US")} characters`;

/**
 * What stands in for removed text. Never inside a call's arguments: an old
 * write_file rebuilt as {"content":"[2,450 characters, cleared to save
 * space]"} is an example of a write_file call, and Qwen3-Coder copied it -
 * it wrote that line into PLAN.md, and over a working script.js
 * (2026-09-28). The long values are dropped from the call instead, and
 * this note follows it, plainly not file content.
 */
export const REMOVED_MARK = "removed from your context to save space";

/**
 * True for text that is one of SHIELD's removal notes - this version's, or
 * the "[N characters, cleared to save space]" of saved histories - rather
 * than real content. A write carrying one is refused (useMCPDialogs).
 */
export function isRemovalNote(text: string): boolean {
  return (
    text.includes(REMOVED_MARK) ||
    /\[[\d,]+ characters, cleared to save space\]/.test(text)
  );
}

const removedArgumentsNote = (n: number) =>
  `[SHIELD ${REMOVED_MARK}: ${chars(n)} of the call above. The call already ran; its text is not shown here and is not file content. Read the file to see what it contains now.]`;

/** The call's arguments without long strings, and how much was dropped */
function dropLongStrings(value: unknown): { value: unknown; dropped: number } {
  if (Array.isArray(value)) {
    let dropped = 0;
    const items = value
      .filter((item) => {
        const long = typeof item === "string" && item.length > LONG_STRING;
        if (long) dropped += item.length;
        return !long;
      })
      .map((item) => {
        const inner = dropLongStrings(item);
        dropped += inner.dropped;
        return inner.value;
      });
    return { value: items, dropped };
  }
  if (value && typeof value === "object") {
    let dropped = 0;
    const kept: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string" && item.length > LONG_STRING) {
        dropped += item.length;
        continue;
      }
      const inner = dropLongStrings(item);
      dropped += inner.dropped;
      kept[key] = inner.value;
    }
    return { value: kept, dropped };
  }
  return { value, dropped: 0 };
}

function compactCall(block: string): string {
  if (block.length < KEEP_BELOW) return block;
  const [call] = extractToolCalls(block);
  if (!call || call.argumentsError) {
    // Unreadable anyway; keep the frame, drop the bulk
    return `${block.replace(
      /<arguments>[\s\S]*?(<\/arguments>|(?=<\/tool_call>))/,
      () => "<arguments>{}</arguments>"
    )}\n${removedArgumentsNote(block.length)}`;
  }
  const { value, dropped } = dropLongStrings(call.arguments);
  return [
    "<tool_call>",
    `<server>${call.serverName}</server>`,
    `<tool>${call.tool}</tool>`,
    `<arguments>${JSON.stringify(value)}</arguments>`,
    "</tool_call>",
    ...(dropped > 0 ? [removedArgumentsNote(dropped)] : []),
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
      `[An unfinished tool call of ${chars(out.length - openAfter)}, ${REMOVED_MARK}. It never ran.]`;
  }
  return out;
}

function compactResults(content: string): string {
  return content.replace(
    /<result>([\s\S]*?)<\/result>/g,
    (whole: string, body: string) =>
      body.length < KEEP_BELOW
        ? whole
        : `<result>\n[SHIELD ${REMOVED_MARK}: this result, ${chars(body.length)}. It is not the file's content. Run the tool again if you need it.]\n</result>`
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

/** Share of the window past which the next request makes room first */
export const COMPACT_AT = 0.6;
/**
 * Once clearing runs, it goes on to this share. Each clearing makes the
 * server re-read everything after the first message it changed (~10 s for
 * 12k tokens at 32K), and clearing only just under COMPACT_AT ran again
 * after the next file read, twice in one turn (2026-09-25).
 */
export const CLEAR_TO = 0.4;

/**
 * Whether the next request should compact first: the prompt is estimated
 * to pass `limit` of the window, leaving the rest for the reply.
 */
export function shouldCompact(
  lastContextTokens: number,
  nextMessageChars: number,
  contextSize: number,
  limit = COMPACT_AT
): boolean {
  // ~3 characters per token for code-heavy text
  const estimate = lastContextTokens + nextMessageChars / 3;
  return contextSize > 0 && estimate > contextSize * limit;
}
