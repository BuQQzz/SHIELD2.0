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
 * (2026-09-28). The long values are dropped from the call instead.
 *
 * Nor in the model's own turns: a note right after each shortened call was
 * read as part of how its turns look. In a 23-step session Bonsai 2 began
 * writing the note itself, 43 times in 210 replies, often in place of the
 * call, and stopped doing any work for ten steps (2026-11-09). The note goes
 * at the head of the next message, the one that carries the results.
 */
export const REMOVED_MARK = "removed from your context to save space";

/**
 * True for text that is one of SHIELD's removal notes - this version's, or
 * the "[N characters, cleared to save space]" of saved histories - rather
 * than real content. A call carrying one is refused (mcpMessageHandler).
 */
export function isRemovalNote(text: string): boolean {
  return (
    text.includes(REMOVED_MARK) ||
    /\[[\d,]+ characters, cleared to save space\]/.test(text)
  );
}

/** A removal note in a reply's text: SHIELD's own in old histories, or one the model copied */
const NOTE_IN_REPLY = /\n*\[[^[\]]*removed from your context to save space[^[\]]*\]/g;

/**
 * The reply without removal notes in its text. One the model wrote itself
 * would teach it, from its own turns, to write more.
 */
export function stripRemovalNotes(text: string): string {
  return text.replace(NOTE_IN_REPLY, "");
}

/** For the message after a shortened reply */
const movedNote = (removed: number, unfinished: number) =>
  [
    removed > 0
      ? `[SHIELD ${REMOVED_MARK}: ${chars(removed)} of long text (file content, edit text) from the tool calls in your message above. Those calls already ran; the text is gone from this history, not from the files. Read a file to see what it contains now.]`
      : "",
    unfinished > 0
      ? `[SHIELD ${REMOVED_MARK}: an unfinished tool call of ${chars(unfinished)} at the end of your message above. It never ran.]`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

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

function compactCall(block: string): { block: string; dropped: number } {
  if (block.length < KEEP_BELOW) return { block, dropped: 0 };
  const [call] = extractToolCalls(block);
  if (!call || call.argumentsError) {
    // Unreadable anyway; keep the frame, drop the bulk
    return {
      block: block.replace(
        /<arguments>[\s\S]*?(<\/arguments>|(?=<\/tool_call>))/,
        () => "<arguments>{}</arguments>"
      ),
      dropped: block.length,
    };
  }
  const { value, dropped } = dropLongStrings(call.arguments);
  return {
    block: [
      "<tool_call>",
      `<server>${call.serverName}</server>`,
      `<tool>${call.tool}</tool>`,
      `<arguments>${JSON.stringify(value)}</arguments>`,
      "</tool_call>",
    ].join("\n"),
    dropped,
  };
}

function compactAssistant(content: string): {
  content: string;
  removed: number;
  unfinished: number;
} {
  let removed = 0;
  let unfinished = 0;
  let out = stripRemovalNotes(content).replace(
    /<tool_call>[\s\S]*?<\/tool_call>/g,
    (block: string) => {
      const compacted = compactCall(block);
      removed += compacted.dropped;
      return compacted.block;
    }
  );

  // A call the reply was cut off in the middle of (it never ran)
  const CLOSE = "</tool_call>";
  const lastClose = out.lastIndexOf(CLOSE);
  const openAfter = out.indexOf(
    "<tool_call>",
    lastClose === -1 ? 0 : lastClose + CLOSE.length
  );
  if (openAfter !== -1 && out.length - openAfter > KEEP_BELOW) {
    unfinished = out.length - openAfter;
    out = out.slice(0, openAfter).trimEnd();
  }
  return { content: out, removed, unfinished };
}

/** A line that defines something in Python, JS/TS, Go, Rust or a shell */
const DEFINITION =
  /^\s*(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:def|class|function\*?|interface|type|enum|func|fn|struct|impl)\s+[\w$]+|(?:export\s+)?(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|[\w-]+\s*\(\)\s*\{)/;
const MAX_DEFINITIONS = 60;

/**
 * The definitions a cleared read showed, so the model knows what is in the
 * file without reading it all again. In g5 step 17 Bonsai 2 read a
 * 1,069-line spend.py 11 times in one turn, in chunks of up to 760 lines:
 * each time a read was cleared it read the file again "to see the full
 * picture", about 15 of the turn's 25 minutes. Once it used grep -n and
 * short ranges, each look took 4-8 s (2026-11-09).
 */
function definitionsIn(body: string): string[] {
  const found: string[] = [];
  for (const line of body.split("\n")) {
    if (DEFINITION.test(line)) {
      found.push(line.trim().replace(/\s*[{:]\s*$/, "").slice(0, 90));
    }
  }
  return found.length >= 3 ? found : [];
}

function compactResults(content: string): string {
  return content.replace(
    /<result>([\s\S]*?)<\/result>/g,
    (whole: string, body: string) => {
      if (body.length < KEEP_BELOW) return whole;
      const note = `[SHIELD ${REMOVED_MARK}: this result, ${chars(body.length)}. It is not the file's content. Run the tool again if you need it.]`;
      const definitions = definitionsIn(body);
      if (definitions.length === 0) return `<result>\n${note}\n</result>`;
      const shown = definitions.slice(0, MAX_DEFINITIONS);
      const more =
        definitions.length > shown.length
          ? `\n... and ${definitions.length - shown.length} more`
          : "";
      return `<result>\n${note}\nIt showed these definitions (grep -n for one to find its lines, then read just that range):\n${shown.join("\n")}${more}\n</result>`;
    }
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

  const compacted = history.map((entry, i) =>
    i >= cutoff || entry.role !== "user"
      ? entry
      : { ...entry, content: compactResults(entry.content) }
  );
  for (let i = 0; i < cutoff; i++) {
    if (history[i]!.role !== "assistant") continue;
    const { content, removed, unfinished } = compactAssistant(
      history[i]!.content
    );
    compacted[i] = { ...history[i]!, content };
    const note = movedNote(removed, unfinished);
    const next = compacted[i + 1];
    if (note && next?.role === "user") {
      compacted[i + 1] = { ...next, content: `${note}\n\n${next.content}` };
    }
  }

  let before = 0;
  let after = 0;
  for (let i = 0; i < history.length; i++) {
    before += history[i]!.content.length;
    after += compacted[i]!.content.length;
  }
  savedChars = before - after;
  // Unchanged entries stay the same objects
  return {
    history: compacted.map((entry, i) =>
      entry.content === history[i]!.content ? history[i]! : entry
    ),
    savedChars,
  };
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
