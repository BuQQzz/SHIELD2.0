/**
 * Task Capsule
 *
 * The second way to make room in the model's history, after clearing old
 * tool payloads (historyCompaction). When that is not enough - a long chat
 * that is mostly prose, or many small steps - the oldest turns are replaced
 * by a capsule in the system message: what the user asked and which tools
 * were called, listed exactly by SHIELD, and a short note the model writes
 * about where the work stands (SHIELD_OPTIMIZATION_TOOLING_CONTEXT_DESIGN.md
 * §9, "Task Capsule").
 *
 * The lists are SHIELD's because a model summarising its own history drops
 * and invents file names. The note is the model's because only it knows why
 * it did what it did.
 *
 * Only the model's copy changes. The conversation shown and saved keeps
 * everything, and shows the capsule as a step in the reply that needed it.
 * The reply saves the capsule too, so a restored chat resumes from it
 * instead of summarising again.
 */

import {
  extractToolCalls,
  stripToolCallMarkup,
} from "../handlers/toolCallParsing.js";
import { isToolResultTurn } from "./contextBreakdown.js";
import type { HistoryEntry } from "./historyCompaction.js";
import { trashName } from "../utils/platform.js";

export interface CapsuleStep {
  /** "wrote", "read", "searched the web for" */
  verb: string;
  /** Path, URL or query as the model gave it */
  target: string;
  count: number;
  /** Set when the call did not do what the verb says */
  outcome?: "failed" | "not run";
}

export interface Capsule {
  /** What the user typed, oldest first, trimmed */
  requests: string[];
  /** Requests older than the list keeps */
  earlierRequests: number;
  steps: CapsuleStep[];
  /** Steps older than the list keeps */
  earlierSteps: number;
  /** The model's note: where the work stands, decisions, what is left */
  note: string;
}

/** Share of the window kept as it is after summarising, at most */
export const KEEP_SHARE = 0.25;
/** Share of the window the capsule may take in the system message */
export const CAPSULE_SHARE = 0.1;
/** Least share of the window a summary keeps whole */
const MIN_KEEP_SHARE = 0.1;

/**
 * Characters of recent history a summary keeps whole: what fits under
 * CLEAR_TO beside the system prompt and the capsule, at most KEEP_SHARE.
 * A flat KEEP_SHARE left Bonsai 2 27B at 24k with ~49% after each summary
 * (a 3.4k-token system prompt, capsule and kept turns), so the next web
 * page passed COMPACT_AT and it summarised every round, each time making
 * the server read the whole prompt again (2026-10-29).
 */
export function keepCharsFor(
  contextSize: number,
  systemPromptChars: number,
  clearTo: number
): number {
  const window = contextSize * 3;
  const room = window * (clearTo - CAPSULE_SHARE) - systemPromptChars;
  return Math.max(window * MIN_KEEP_SHARE, Math.min(window * KEEP_SHARE, room));
}
/**
 * Three short lines. Low, so a model that drifts into its reply instead
 * (it did at 300) is cut off within seconds.
 */
export const NOTE_MAX_TOKENS = 180;

const MAX_REQUESTS = 12;
/** An older request, in the capsule */
const MAX_REQUEST_CHARS = 300;
/**
 * The latest request, kept nearly whole: it is the task under way. Cut to
 * 300 characters, a 700-character request lost its file name, its grouping
 * and its last step to a summary mid-task, and Bonsai 2 27B finished
 * without them (2026-10-29).
 */
const MAX_LATEST_REQUEST_CHARS = 2000;
const MAX_STEPS = 40;
const MAX_NOTE_CHARS = 1200;

/** Shortened replies in the kept part keep at least this much */
const MIN_REPLY_CHARS = 1500;
/** Model prose in a removed slice worth a new note */
const NOTE_PROSE_CHARS = 1000;

/**
 * Sent after the turns that are about to go, before `nextMessage` is. A
 * fixed three-line form: asked mid-task for "a short note", Qwen3-Coder
 * carried on with its reply instead ("Let me create a detailed
 * explanation... # Complete Network Communication Flow", 2026-09-25). It
 * says what comes next: asked before its tool results were sent, the model
 * wrote "my web search didn't return clear results" - untrue, and then in
 * front of it for the rest of the turn (2026-09-25).
 */
export function noteRequest(nextMessage: string): string {
  const next = isToolResultTurn(nextMessage)
    ? "The results of your latest tool calls come right after this note. You have not seen them yet, so do not say what they contain."
    : "The user's next message comes right after this note.";
  return [
    "Pause the task: do not answer the user and do not continue the work.",
    "SHIELD is about to remove the messages above from your context to make room. Your most recent messages stay, and SHIELD keeps a list of the user's requests and of your tool calls.",
    next,
    "Write a note to yourself for carrying on afterwards, as three short lines:",
    "State: where the work stands.",
    'Decisions: what you decided and why, or "none".',
    'Next: what is still to do, or "nothing".',
    "Plain text only. No headings, no code, no tool calls.",
  ].join("\n");
}

const VERBS: Record<string, string> = {
  read_file: "read",
  read_text_file: "read",
  read_media_file: "read",
  read_multiple_files: "read",
  write_file: "wrote",
  edit_file: "edited",
  create_directory: "created folder",
  list_directory: "listed",
  list_directory_with_sizes: "listed",
  directory_tree: "mapped",
  move_file: "moved",
  search_files: "searched",
  get_file_info: "checked",
  delete_file: `moved to the ${trashName()}`,
  list_allowed_directories: "listed the allowed folders",
  web_search: "searched the web for",
  fetch_page: "read the page",
  run_command: "ran",
  search_memory: "searched memory for",
  open_memory: "opened memory",
  update_plan: "updated the plan",
};

/**
 * What the user typed, without what SHIELD adds for the model: the
 * [Current folder], [Not run] and work-record notes, and the tool-retry
 * wrapper.
 */
export function requestText(
  content: string,
  maxChars = MAX_LATEST_REQUEST_CHARS
): string {
  let text = content.replace(
    /\s*\[(?:Current folder: |Not run: |SHIELD's record of |From SHIELD's memory |SHIELD: )[\s\S]*?\]\s*$/,
    ""
  );
  if (text.startsWith("You have MCP filesystem tools available")) {
    text = text.match(/\nUser request: ([\s\S]*)$/)?.[1] ?? text;
  }
  text = text.replace(/\s+/g, " ").trim();
  return shorten(text, maxChars);
}

function shorten(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

/** What a call acted on, as the model wrote it */
function stepTarget(args: Record<string, unknown>): string {
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  const source = text(args.source);
  const destination = text(args.destination);
  if (source && destination) return `${source} → ${destination}`;
  const paths = Array.isArray(args.paths)
    ? args.paths.filter((p): p is string => typeof p === "string")
    : [];
  return (
    text(args.path) ??
    (paths.length > 0 ? paths.join(", ") : undefined) ??
    (text(args.query) ? `"${args.query}"` : undefined) ??
    text(args.url) ??
    (text(args.command) ? `\`${args.command}\`` : undefined) ??
    ""
  );
}

/**
 * How each call in a reply turned out, from the tool-result turn after it:
 * one <tool_result> per call, in order. Unknown when the counts differ (a
 * repeated call is answered without an envelope).
 */
function outcomes(
  callCount: number,
  resultTurn: HistoryEntry | undefined
): (CapsuleStep["outcome"] | undefined)[] {
  if (!resultTurn || !isToolResultTurn(resultTurn.content)) return [];
  const blocks = resultTurn.content.split("<tool_result").slice(1);
  if (blocks.length !== callCount) return [];
  return blocks.map((block) => {
    if (!block.includes("<error>")) return undefined;
    return /NOT executed/.test(block) ? "not run" : "failed";
  });
}

/** The tool calls in `entries`, merged into steps with counts */
export function stepsFrom(entries: HistoryEntry[]): CapsuleStep[] {
  const steps: CapsuleStep[] = [];
  entries.forEach((entry, i) => {
    if (entry.role !== "assistant") return;
    const calls = extractToolCalls(entry.content);
    const results = outcomes(calls.length, entries[i + 1]);
    calls.forEach((call, j) => {
      addStep(steps, {
        verb: VERBS[call.tool] ?? `used ${call.tool}`,
        target: stepTarget(call.arguments),
        count: 1,
        outcome: call.argumentsError ? "not run" : results[j],
      });
    });
  });
  return steps;
}

/** Counts a repeat of the same step instead of listing it twice */
function addStep(steps: CapsuleStep[], step: CapsuleStep): void {
  const same = steps.find(
    (s) =>
      s.verb === step.verb &&
      s.target === step.target &&
      s.outcome === step.outcome
  );
  if (same) same.count += step.count;
  else steps.push({ ...step });
}

/**
 * The model's note: its State / Decisions / Next lines when it wrote them,
 * else the text before it drifted into a reply (a heading or a code
 * block). No tool calls, within its size.
 */
export function cleanNote(note: string): string {
  const text = stripToolCallMarkup(note);
  const fields = text.match(/^[\s*_-]*(State|Decisions|Next)\b[^:\n]*:.*$/gim);
  let kept: string;
  if (fields) {
    kept = fields.map((line) => line.replace(/\*\*|__/g, "").trim()).join("\n");
  } else {
    const lines = text.split("\n");
    const drift = lines.findIndex((line) => /^\s*(#|```)/.test(line));
    kept = (drift === -1 ? lines : lines.slice(0, drift)).join("\n").trim();
  }
  return kept.length > MAX_NOTE_CHARS
    ? `${kept.slice(0, MAX_NOTE_CHARS - 1)}…`
    : kept;
}

/**
 * The capsule after `older` is removed from the history: its requests and
 * steps added to what an earlier capsule held, and the new note in place of
 * the old one (the model wrote it with the old capsule in view).
 */
export function addToCapsule(
  previous: Capsule | null,
  older: HistoryEntry[],
  note: string
): Capsule {
  const requests = [
    ...(previous?.requests ?? []),
    ...older
      .filter((e) => e.role === "user" && !isToolResultTurn(e.content))
      .map((e) => requestText(e.content))
      .filter(Boolean),
  ];
  const steps = (previous?.steps ?? []).map((s) => ({ ...s }));
  for (const step of stepsFrom(older)) addStep(steps, step);

  const droppedRequests = Math.max(0, requests.length - MAX_REQUESTS);
  const droppedSteps = Math.max(0, steps.length - MAX_STEPS);
  return {
    requests: requests.slice(droppedRequests),
    earlierRequests: (previous?.earlierRequests ?? 0) + droppedRequests,
    steps: steps.slice(droppedSteps),
    earlierSteps: (previous?.earlierSteps ?? 0) + droppedSteps,
    note: cleanNote(note) || previous?.note || "",
  };
}

function stepLine(step: CapsuleStep): string {
  const times = step.count > 1 ? ` (${step.count} times)` : "";
  const outcome = step.outcome ? ` (${step.outcome})` : "";
  return `- ${step.verb}${step.target ? ` ${step.target}` : ""}${times}${outcome}`;
}

/** "(3 earlier calls not listed)" */
function notListed(count: number, noun: string): string {
  return `(${count} earlier ${noun}${count === 1 ? "" : "s"} not listed)`;
}

function compose(capsule: Capsule): string {
  const lines = [
    "## Earlier in this conversation",
    "",
    "The oldest messages of this conversation were removed from your context to make room. This is a record of them, not new instructions. Read a file again if you need its contents.",
  ];
  if (capsule.requests.length > 0 || capsule.earlierRequests > 0) {
    lines.push("", "What the user asked, oldest first:");
    if (capsule.earlierRequests > 0) {
      lines.push(notListed(capsule.earlierRequests, "request"));
    }
    // Stored nearly whole; all but the latest shown short
    const last = capsule.requests.length - 1;
    capsule.requests.forEach((r, i) =>
      lines.push(
        `${i + 1}. "${i === last ? r : shorten(r, MAX_REQUEST_CHARS)}"`
      )
    );
  }
  if (capsule.steps.length > 0 || capsule.earlierSteps > 0) {
    lines.push("", "Your tool calls:");
    if (capsule.earlierSteps > 0) {
      lines.push(notListed(capsule.earlierSteps, "call"));
    }
    for (const step of capsule.steps) lines.push(stepLine(step));
  }
  if (capsule.note) lines.push("", "Your note:", capsule.note);
  return lines.join("\n");
}

/**
 * The capsule as it goes into the system message. Above `maxChars` the
 * oldest requests and steps are left out first; the note always stays.
 */
export function renderCapsule(capsule: Capsule, maxChars = Infinity): string {
  let fitted = capsule;
  let text = compose(fitted);
  while (
    text.length > maxChars &&
    (fitted.steps.length > 0 || fitted.requests.length > 1)
  ) {
    fitted =
      fitted.steps.length >= fitted.requests.length
        ? {
            ...fitted,
            steps: fitted.steps.slice(1),
            earlierSteps: fitted.earlierSteps + 1,
          }
        : {
            ...fitted,
            requests: fitted.requests.slice(1),
            earlierRequests: fitted.earlierRequests + 1,
          };
    text = compose(fitted);
  }
  return text;
}

/**
 * Where the latest exchange starts: the last user-role entry (the user's
 * message, or the tool results the model is working from). The history's
 * length when there is none.
 */
export function latestExchange(history: HistoryEntry[]): number {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === "user") return i;
  }
  return history.length;
}

/**
 * Whether removing `older` needs a new note from the model: it holds a
 * request from the user or a good deal of the model's own reasoning. A
 * slice of plain tool rounds does not - the lists record it and the last
 * note stands. Asking anyway cost a 4-7 s pause every round (2026-09-25).
 * A first capsule always gets one.
 */
export function needsNote(
  older: HistoryEntry[],
  previous: Capsule | null
): boolean {
  if (!previous) return true;
  if (older.some((e) => e.role === "user" && !isToolResultTurn(e.content))) {
    return true;
  }
  const prose = older
    .filter((e) => e.role === "assistant")
    .reduce((n, e) => n + stripToolCallMarkup(e.content).trim().length, 0);
  return prose >= NOTE_PROSE_CHARS;
}

/**
 * Where the kept part of the history starts: the most recent entries that
 * fit in `keepChars`, beginning at a user-role entry so that after the
 * system message the roles still alternate. Never after the last user-role
 * entry: the latest exchange is what a follow-up refers to, so it stays
 * even when it alone is over the budget (fitKept then shortens it). Losing
 * it left the model with only a list of topics when asked to "tie it to
 * what we just talked about" (2026-09-25). 0 when nothing older is left to
 * summarise.
 */
export function capsuleCut(history: HistoryEntry[], keepChars: number): number {
  let cut = latestExchange(history);
  let size = history.slice(cut).reduce((n, e) => n + e.content.length, 0);
  for (let i = cut - 1; i >= 0; i--) {
    size += history[i]!.content.length;
    if (size > keepChars) break;
    if (history[i]!.role === "user") cut = i;
  }
  return cut;
}

/**
 * The start and the end of a long reply, with a note of what is left out;
 * `maxChars` includes the note
 */
function shortenReply(content: string, maxChars: number): string {
  const marker = (left: number) =>
    `\n\n[… ${left.toLocaleString("en-US")} characters of this reply left out to make room …]\n\n`;
  // Sized for the longest count it can show
  const room = Math.max(0, maxChars - marker(content.length).length);
  const head = Math.floor(room * 0.7);
  const tail = room - head;
  return (
    content.slice(0, head) +
    marker(content.length - head - tail) +
    content.slice(content.length - tail)
  );
}

/**
 * The kept part within `keepChars` where possible: the longest replies are
 * cut in the middle, down to MIN_REPLY_CHARS. Replies with tool calls stay
 * whole (cutting one would break its markup), and so do the user's turns.
 */
export function fitKept(
  kept: HistoryEntry[],
  keepChars: number
): HistoryEntry[] {
  let over = kept.reduce((n, e) => n + e.content.length, 0) - keepChars;
  if (over <= 0) return kept;

  const out = kept.map((e) => ({ ...e }));
  const longestFirst = out
    .filter((e) => e.role === "assistant" && !e.content.includes("<tool_call>"))
    .sort((a, b) => b.content.length - a.content.length);
  for (const entry of longestFirst) {
    if (over <= 0) break;
    const target = Math.max(MIN_REPLY_CHARS, entry.content.length - over);
    if (target >= entry.content.length) continue;
    const shortened = shortenReply(entry.content, target);
    over -= entry.content.length - shortened.length;
    entry.content = shortened;
  }
  return out;
}

/**
 * Replace the oldest turns with a capsule, keeping the last `keepChars` of
 * the history - and always the latest exchange, shortened if need be.
 * `writeNote` asks the model for its note on the turns being removed; if it
 * fails the capsule is built without one, since the room is needed either
 * way. An abort is passed on. Null when there is nothing older to
 * summarise.
 */
export async function summariseOldest(
  history: HistoryEntry[],
  previous: Capsule | null,
  keepChars: number,
  writeNote: (older: HistoryEntry[]) => Promise<string>
): Promise<{ history: HistoryEntry[]; capsule: Capsule } | null> {
  const cut = capsuleCut(history, keepChars);
  if (cut === 0) return null;

  const older = history.slice(0, cut);
  let note = "";
  try {
    if (needsNote(older, previous)) note = await writeNote(older);
  } catch (error) {
    // Stop was pressed: fetch throws a DOMException, not always an Error
    if ((error as { name?: unknown } | null)?.name === "AbortError") {
      throw error;
    }
    console.warn("[TaskCapsule] No note from the model:", error);
  }
  return {
    history: fitKept(history.slice(cut), keepChars),
    capsule: addToCapsule(previous, older, note),
  };
}

/**
 * A capsule as saved with the chat, on the reply that needed it, so that
 * reopening the chat does not summarise it all over again (a 5-15 s pause
 * on the next message)
 */
export interface SavedCapsule extends Capsule {
  /**
   * The model's exact history after summarising, before the request that
   * needed the capsule. Kept replies may have been shortened and the model
   * may have seen retry turns that are absent from the visible chat.
   */
  modelHistory: HistoryEntry[];
  /** Total model-history entries represented by this and earlier capsules. */
  replacedEntries: number;
}

/** A chat message as the page sends it back to restore a chat */
export interface SavedMessage extends HistoryEntry {
  capsule?: SavedCapsule;
}

/**
 * The model's history for a restored chat, one entry per turn: a saved
 * chat can hold two messages of one role in a row - one per tool result,
 * or the tool-round limit notice after the model's last reply - and the
 * server refuses "2 or more assistant messages at the end of the list"
 * (2026-09-25). `saved` holds the exact model history the latest capsule
 * kept and the start of the visible request/reply that needed it. The
 * provider appends the live history from that point when the capsule is
 * used, so turns added after restoring the chat are retained too.
 */
export function restoreHistory(messages: SavedMessage[]): {
  history: HistoryEntry[];
  saved: {
    capsule: Capsule;
    modelHistory: HistoryEntry[];
    start: number;
    replacedEntries: number;
  } | null;
} {
  const history: HistoryEntry[] = [];
  let latest: { capsule: SavedCapsule; at: number } | null = null;
  for (const { role, content, capsule } of messages) {
    if (role === "system") continue;
    const last = history.at(-1);
    if (last?.role === role) last.content += `\n\n${content}`;
    else history.push({ role, content });
    if (capsule) latest = { capsule, at: history.length - 1 };
  }
  if (!latest) return { history, saved: null };

  const { modelHistory, replacedEntries, ...capsule } = latest.capsule;
  if (
    !Array.isArray(modelHistory) ||
    !modelHistory.every(
      (entry) =>
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string"
    ) ||
    !Number.isInteger(replacedEntries) ||
    replacedEntries < 1
  ) {
    return { history, saved: null };
  }

  // The capsule is saved on the assistant reply. The user-role run just
  // before it is the request that needed the summary, including all tool
  // results when several calls answered one reply.
  let start = latest.at - 1;
  while (start >= 0 && history[start]!.role !== "user") start--;
  if (start < 0) return { history, saved: null };

  return {
    history,
    saved: {
      capsule,
      modelHistory: modelHistory.map(({ role, content }) => ({
        role,
        content,
      })),
      start,
      replacedEntries,
    },
  };
}
