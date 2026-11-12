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
import { outline } from "../utils/codeOutline.js";

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
  const found = outline(body).map((d) => d.text);
  return found.length >= 3 ? found : [];
}

/** A result SHIELD has cleared already: clearing it again only rewrites it */
function isCleared(body: string): boolean {
  return body.trimStart().startsWith(`[SHIELD ${REMOVED_MARK}`);
}

function compactResults(content: string): string {
  return content.replace(
    /<result>([\s\S]*?)<\/result>/g,
    (whole: string, body: string) => {
      if (body.length < KEEP_BELOW) return whole;
      // Cleared already: a note with definitions can pass KEEP_BELOW, and
      // clearing it again rewrote it ("this result, 4,537 characters" of
      // the note, definitions read from the note's own list). In g33 every
      // later clearing changed 21-25 early results for ~45 characters, and
      // the server re-read the prompt from the first of them: "cleared 2
      // characters", then 6,865 tokens read again (2026-11-12)
      if (isCleared(body)) return whole;
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

const READ_TOOLS = new Set(["read_text_file", "read_file"]);

/**
 * What one result showed of a file: all of it, some line ranges, or the
 * lines between two awk patterns (known only by the pattern)
 */
interface FilePart {
  file: string;
  whole?: boolean;
  lines?: Array<[number, number]>;
  awk?: string;
  /** The last N lines */
  tail?: number;
}

/** A result block that did nothing but show parts of files */
interface ReadBlock {
  entry: number;
  block: number;
  parts: FilePart[];
}

/** An sh line split at unquoted ;, && and ||; null when it pipes or redirects */
function shSegments(command: string): string[][] | null {
  const segments: string[][] = [[]];
  let word = "";
  let inWord = false;
  let quote: string | null = null;
  const end = () => {
    if (inWord) segments[segments.length - 1]!.push(word);
    word = "";
    inWord = false;
  };
  const chars = [...command];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else word += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inWord = true;
    } else if (c === ";" || c === "\n" || (c === "&" && chars[i + 1] === "&") || (c === "|" && chars[i + 1] === "|")) {
      if (c !== ";" && c !== "\n") i++;
      end();
      segments.push([]);
    } else if (/[|<>&`$()]/.test(c)) {
      return null;
    } else if (/\s/.test(c)) {
      end();
    } else {
      word += c;
      inWord = true;
    }
  }
  if (quote) return null;
  end();
  return segments.filter((words) => words.length > 0);
}

/**
 * The parts of files a command only shows - `sed -n 'A,Bp;C,Dp' F`,
 * `awk '/x/,/y/' F`, `cat F`, `head -n N F` - after an optional `cd DIR`
 * and with `echo` lines between. Null when it does anything else: a block
 * that also ran the script or printed other output is never stale. Bonsai 2
 * moved from read_text_file to these in g8-g10 and re-read overlapping
 * ranges (640-760, then 700-835) (2026-11-09).
 */
function commandReads(command: string): FilePart[] | null {
  const segments = shSegments(command);
  if (!segments || segments.length === 0) return null;
  let dir = "";
  const parts: FilePart[] = [];
  for (const [name, ...args] of segments) {
    const at = (file: string) =>
      /^[/~]/.test(file) || !dir ? file : `${dir.replace(/\/+$/, "")}/${file}`;
    if (name === "cd" && args.length === 1) dir = args[0]!;
    else if (name === "echo" || name === "wc") continue;
    else if (name === "sed" && args[0] === "-n" && args.length >= 3) {
      const ranges = args[1]!.split(";").map((r) => r.trim().match(/^(\d+)(?:,(\d+))?p$/));
      if (ranges.some((r) => !r)) return null;
      const lines = ranges.map((r) => [Number(r![1]), Number(r![2] ?? r![1])] as [number, number]);
      for (const file of args.slice(2)) parts.push({ file: at(file), lines });
    } else if ((name === "awk" || name === "gawk") && args.length === 2 && /^\/.*\/\s*,\s*\/.*\/$/.test(args[0]!)) {
      parts.push({ file: at(args[1]!), awk: args[0]! });
    } else if (name === "cat" && args.length >= 1 && args.every((a) => !a.startsWith("-"))) {
      for (const file of args) parts.push({ file: at(file), whole: true });
    } else if (name === "head" && args.length === 3 && args[0] === "-n" && /^\d+$/.test(args[1]!)) {
      parts.push({ file: at(args[2]!), lines: [[1, Number(args[1])]] });
    } else return null;
  }
  return parts.length > 0 ? parts : null;
}

/** What a read_text_file call showed */
function toolRead(args: Record<string, unknown>): FilePart[] | null {
  const { path, head, tail } = args;
  if (typeof path !== "string") return null;
  if (head === undefined && tail === undefined) return [{ file: path, whole: true }];
  if (typeof head === "number" && tail === undefined) return [{ file: path, lines: [[1, head]] }];
  // g5 read the end of spend.py four times: tail 370, 372, 374, 374
  if (typeof tail === "number" && head === undefined) return [{ file: path, tail }];
  return null;
}

/** Each result block in `history` that only showed parts of files */
function readBlocks(history: HistoryEntry[]): ReadBlock[] {
  const reads: ReadBlock[] = [];
  history.forEach((entry, i) => {
    const results = history[i + 1];
    if (entry.role !== "assistant" || results?.role !== "user") return;
    const calls = extractToolCalls(entry.content);
    const blocks = results.content.split("<tool_result").length - 1;
    // One result block per call, in order; otherwise they can't be paired
    if (calls.length === 0 || blocks !== calls.length) return;
    calls.forEach((call, block) => {
      const parts = READ_TOOLS.has(call.tool)
        ? toolRead(call.arguments)
        : call.tool === "run_command" && typeof call.arguments.command === "string"
          ? commandReads(call.arguments.command)
          : null;
      if (parts) reads.push({ entry: i + 1, block, parts });
    });
  });
  return reads;
}

/** The same file: full paths must match; a bare name matches by name */
function sameFile(a: string, b: string): boolean {
  if (a === b) return true;
  const rooted = (p: string) => /^[/~]/.test(p) || /^[A-Za-z]:/.test(p);
  if (rooted(a) && rooted(b)) return false;
  const base = (p: string) => p.split(/[\\/]/).pop();
  return base(a) === base(b);
}

/** Every line of `part` is shown by one of `later` */
function covered(part: FilePart, later: FilePart[]): boolean {
  const same = later.filter((l) => sameFile(l.file, part.file));
  if (same.some((l) => l.whole)) return true;
  if (part.whole) return false;
  if (part.awk !== undefined) return same.some((l) => l.awk === part.awk);
  // A later tail at least as long shows the end of the file again
  if (part.tail !== undefined) return same.some((l) => (l.tail ?? 0) >= part.tail!);
  const ranges = same.flatMap((l) => l.lines ?? []);
  const lines = part.lines ?? [];
  if (lines.length === 0) return false;
  return lines.every(([from, to]) => {
    for (let line = from; line <= to; ) {
      const next = ranges.find(([a, b]) => a <= line && line <= b);
      if (!next) return false;
      line = next[1] + 1;
    }
    return true;
  });
}

/**
 * Clear the results of reads the model has since read again (the same
 * lines, or all of the file): those copies are out of date, and clearing
 * them first keeps what it is working from. In g5 step 17 the oldest
 * results went first, often the read the model had just planned from,
 * and it read the file again (2026-11-09). The last entry, the results the
 * model is about to see, is left alone.
 */
export function compactStaleReads(history: HistoryEntry[]): {
  history: HistoryEntry[];
  savedChars: number;
} {
  const reads = readBlocks(history);
  const stale = new Map<number, Map<number, string>>();
  reads.forEach((read) => {
    if (read.entry >= history.length - 1) return;
    const later = reads.filter((r) => r.entry > read.entry).flatMap((r) => r.parts);
    if (read.parts.every((part) => covered(part, later))) {
      const blocks = stale.get(read.entry) ?? new Map<number, string>();
      const names = [...new Set(read.parts.map((p) => p.file.split(/[\\/]/).pop()))];
      blocks.set(read.block, names.join(", "));
      stale.set(read.entry, blocks);
    }
  });
  let savedChars = 0;
  const out = history.map((entry, i) => {
    const blocks = stale.get(i);
    if (!blocks) return entry;
    let block = -1;
    const content = entry.content.replace(
      /<tool_result[\s\S]*?<\/tool_result>/g,
      (whole: string) => {
        block += 1;
        const name = blocks.get(block);
        if (name === undefined) return whole;
        return whole.replace(
          /<result>([\s\S]*?)<\/result>/,
          (result: string, body: string) =>
            body.length < KEEP_BELOW || isCleared(body)
              ? result
              : `<result>\n[SHIELD ${REMOVED_MARK}: this result, ${chars(body.length)}, an older read of ${name}. You read those lines again later; that read is the current one.]\n</result>`
        );
      }
    );
    savedChars += entry.content.length - content.length;
    return content === entry.content ? entry : { ...entry, content };
  });
  return { history: out, savedChars };
}

/**
 * Compact every entry except the last `keepRecent`, which the model is
 * still working from. Idempotent: cleared results and compacted calls are
 * left alone next time (isCleared), so the history only changes when there
 * is new bulk.
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
