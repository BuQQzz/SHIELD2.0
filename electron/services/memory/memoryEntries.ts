/**
 * What SHIELD's memory index holds, and how it is searched and shown.
 *
 * Every saved conversation - chats and code sessions alike - is indexed
 * message by message: what the user asked, the reply without its tool
 * markup (plus the calls it made), and each tool result. Searching is
 * SQLite full-text search (memoryIndex.ts): no model, no GPU, milliseconds,
 * so it works on any machine SHIELD runs on. The model only ever sees a few
 * one-line matches, and opens one when it needs more - it navigates its
 * memory in small steps instead of holding it in its context.
 */

import {
  extractToolCalls,
  stripToolCallMarkup,
} from "../../../src/handlers/toolCallParsing.js";
import { ledgerEntries } from "../../../src/handlers/workLedger.js";
import type { Message } from "../../../src/types/conversation.js";

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | Date;
  toolResult?: { tool: string; target?: string; success?: boolean };
}

export interface MemoryConversation {
  id: string;
  title: string;
  messages: MemoryMessage[];
  createdAt: string | Date;
  updatedAt: string | Date;
  kind?: "chat" | "code";
  folder?: string;
  projectId?: string;
}

export interface MemoryEntry {
  /** "<conversation id>#<message number>" - what open_memory takes */
  id: string;
  conversationId: string;
  messageIndex: number;
  /** "record": SHIELD's record of what the session actually changed and ran */
  role: "user" | "assistant" | "tool" | "record";
  tool?: string;
  text: string;
  title: string;
  kind: "chat" | "code";
  folder?: string;
  projectId?: string;
  /** Milliseconds since 1970 */
  createdAt: number;
}

/** Results of these are memory itself, not new information */
const MEMORY_TOOLS = new Set(["search_memory", "open_memory"]);

/** Longest text kept per message: enough to find it and read it back */
export const MAX_ENTRY_CHARS = 4000;

const cap = (text: string) =>
  text.length > MAX_ENTRY_CHARS
    ? `${text.slice(0, MAX_ENTRY_CHARS - 1)}…`
    : text;

const time = (value: string | Date | undefined, fallback: number) => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : fallback;
};

/** The payload inside a <tool_result> envelope */
function resultBody(content: string): string {
  const match = content.match(/<(result|error)>([\s\S]*?)<\/\1>/);
  return (match?.[2] ?? content).trim();
}

/** What a call acted on, for "called edit_file set-radio.ps1" */
function callTarget(args: Record<string, unknown>): string {
  for (const key of ["path", "source", "query", "url", "command"]) {
    const value = args[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

/** The index's entries for one conversation, in order */
export function entriesOf(conversation: MemoryConversation): MemoryEntry[] {
  const kind = conversation.kind ?? "chat";
  const created = time(conversation.createdAt, Date.now());
  const entries: MemoryEntry[] = [];
  conversation.messages.forEach((message, index) => {
    const base = {
      id: `${conversation.id}#${index}`,
      conversationId: conversation.id,
      messageIndex: index,
      title: conversation.title,
      kind,
      folder: conversation.folder,
      projectId: conversation.projectId,
      createdAt: time(message.timestamp, created),
    };
    if (message.toolResult) {
      const { tool, target, success } = message.toolResult;
      // Copies of other entries: indexed, they came back as the top
      // matches for the very search that produced them (2026-09-28)
      if (MEMORY_TOOLS.has(tool)) return;
      const body = resultBody(message.content);
      if (!body) return;
      const head = `${tool}${target ? ` ${target}` : ""}${success === false ? " (failed)" : ""}`;
      entries.push({
        ...base,
        role: "tool",
        tool,
        text: cap(`${head}\n${body}`),
      });
      return;
    }
    if (message.role === "user") {
      const text = message.content.trim();
      if (text) entries.push({ ...base, role: "user", text: cap(text) });
      return;
    }
    const prose = stripToolCallMarkup(message.content).trim();
    const calls = extractToolCalls(message.content).map((call) =>
      `called ${call.tool} ${callTarget(call.arguments)}`.trim()
    );
    const text = [prose, ...calls].filter(Boolean).join("\n");
    if (text) entries.push({ ...base, role: "assistant", text: cap(text) });
  });

  // What the session actually changed and ran, from the tools' results.
  // Memory held only what was said: asked in a new chat what became of the
  // GUID fix, Qwen3-Coder opened the reply that had proposed it as code to
  // paste, and said "we replaced the hardcoded GUID handling" - an edit
  // that had failed and was never applied (2026-09-28).
  const record = ledgerEntries(
    conversation.messages as unknown as Message[],
    conversation.folder
  );
  if (record.length > 0) {
    entries.push({
      id: `${conversation.id}${RECORD_ID}`,
      conversationId: conversation.id,
      messageIndex: conversation.messages.length,
      role: "record",
      text: cap(
        `${RECORD_HEADING}\n${record.map((line) => `- ${line}`).join("\n")}`
      ),
      title: conversation.title,
      kind,
      folder: conversation.folder,
      projectId: conversation.projectId,
      createdAt: time(conversation.updatedAt, created),
    });
  }
  return entries;
}

/** The record entry's id, after the conversation's */
export const RECORD_ID = "#record";

const RECORD_HEADING =
  "SHIELD's record of what this session actually changed and ran, from the tools' results:";

/** The record's lines, without its heading */
export function recordLines(recordText: string): string[] {
  return recordText
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

/** Lines that say something was not done: failed, declined, refused */
export function notDoneLines(lines: string[]): string[] {
  return lines.filter((line) =>
    /FAILED - nothing changed|not done|did not finish|NOT in the file/.test(
      line
    )
  );
}

/** File names in a line or a text: "set-radio.ps1", "FIXES.md" */
function fileNames(text: string): string[] {
  return (text.match(/[\w.-]+\.[A-Za-z]\w{0,5}\b/g) ?? []).map((name) =>
    name.toLowerCase()
  );
}

/**
 * The record lines about the files a message mentions - what became of
 * the changes it talks about
 */
export function recordLinesFor(lines: string[], text: string): string[] {
  const mentioned = new Set(fileNames(text));
  if (mentioned.size === 0) return [];
  return lines.filter((line) =>
    fileNames(line.replace(/`[^`]*`/g, "")).some((name) => mentioned.has(name))
  );
}

/** Words that say nothing about what to find */
const STOPWORDS = new Set(
  (
    "a an and are as at be been being but by can could did do does done for from had has have how i if in into is it its " +
    "just let lets me my no not of on or our please so some than that the their them then there these they this those to " +
    "too up us was we were what when where which who why will with would you your yes ok okay thanks also again any all " +
    "about more most other only very should shall may might must get got make made use using used one two now here out"
  ).split(" ")
);

/**
 * The words to search for, split the way the index splits text
 * ("set-radio.ps1" is "set", "radio", "ps1"): lower-case, no stopwords.
 */
export function queryTerms(text: string, max = 12): string[] {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms: string[] = [];
  for (const word of words) {
    if (word.length < 2 || STOPWORDS.has(word) || terms.includes(word)) {
      continue;
    }
    terms.push(word);
    if (terms.length === max) break;
  }
  return terms;
}

/** An FTS5 query matching any of the terms */
export function ftsQuery(terms: string[]): string {
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(" OR ");
}

/** A rough stem, so "fixed" finds "fixes" when counting matched terms */
function stem(word: string): string {
  return word.replace(/(ies|ing|ed|es|s|ly)$/, "") || word;
}

/** How many of the terms the text contains */
export function matchedTerms(text: string, terms: string[]): number {
  const lowered = text.toLowerCase();
  return terms.filter((term) => lowered.includes(stem(term))).length;
}

export interface MemoryHit {
  id: string;
  conversationId: string;
  messageIndex: number;
  role: MemoryEntry["role"];
  tool?: string;
  title: string;
  kind: "chat" | "code";
  folder?: string;
  projectId?: string;
  createdAt: number;
  snippet: string;
  /** BM25: lower is better */
  score: number;
  /** Search terms the entry contains */
  matched: number;
}

const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const folderName = (folder?: string) =>
  folder
    ? (folder
        .replace(/[\\/]+$/, "")
        .split(/[\\/]/)
        .pop() ?? folder)
    : "";

function who(hit: MemoryHit): string {
  if (hit.role === "user") return "the user wrote";
  if (hit.role === "assistant") return "the reply";
  if (hit.role === "record") return "SHIELD's record of what was done";
  return `${hit.tool ?? "tool"} result`;
}

/** At most this many not-done items named per conversation */
const MAX_NOT_DONE = 3;

/**
 * A warning under matches from sessions whose record shows changes that
 * were not made: a reply found in memory may describe exactly those.
 */
export function notDoneWarning(
  hits: { conversationId: string; title: string }[],
  notDone: Map<string, string[]>
): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const hit of hits) {
    const items = notDone.get(hit.conversationId);
    if (!items?.length || seen.has(hit.conversationId)) continue;
    seen.add(hit.conversationId);
    const more =
      items.length > MAX_NOT_DONE
        ? ` (and ${items.length - MAX_NOT_DONE} more)`
        : "";
    lines.push(
      `- In "${hit.title}", SHIELD's record shows these were NOT done: ${items.slice(0, MAX_NOT_DONE).join("; ")}${more}`
    );
  }
  return lines.length
    ? [
        "",
        "Careful - a reply above may describe a change that never happened:",
        ...lines,
      ]
    : [];
}

/** One line per match: where it is from, and the words around the match */
export function hitLine(hit: MemoryHit): string {
  const place = hit.kind === "code" ? "code session" : "chat";
  const folder = folderName(hit.folder);
  const snippet = hit.snippet.replace(/\s+/g, " ").trim();
  return `[${hit.id}] ${date(hit.createdAt)} · ${place} "${hit.title}"${folder ? ` (${folder})` : ""} · ${who(hit)}: ${snippet}`;
}

export function formatSearchResults(
  query: string,
  hits: MemoryHit[],
  notDone: Map<string, string[]> = new Map()
): string {
  if (hits.length === 0) {
    return `Nothing in memory matches "${query}". Try other words - a file name, an error, what the user called it.`;
  }
  return [
    `Memory matches for "${query}", best first:`,
    ...hits.map((hit, i) => `${i + 1}. ${hitLine(hit)}`),
    ...notDoneWarning(hits, notDone),
    "",
    "To read one in full, call open_memory with its id.",
  ].join("\n");
}
