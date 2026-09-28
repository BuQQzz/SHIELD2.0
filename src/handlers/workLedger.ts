/**
 * Work Ledger
 *
 * SHIELD's record of what the model changed and ran in a conversation -
 * every write, edit, move and delete, applied or not, and every command
 * with its exit code - taken from the tools' actual results. Code sessions
 * send it with the user's next message after new work.
 *
 * Why: the model's own replies are no record. Qwen3-Coder's edit of
 * set-radio.ps1's GUID section never matched, yet it told the user the fix
 * was applied, wrote it into FIXES.md, and repeated it in every summary for
 * the rest of the session (2026-09-27/28): the false claim sat in its
 * history as its own words. A record built from tool results contradicts
 * that every time it comes up, whether or not old turns were cleared.
 */

// Relative, not "@/": the main process's memory index uses this module too
import type { Message } from "../types/conversation";
import { extractToolCalls, type ToolCallRequest } from "./toolCallParsing";

/** Longest record sent; older entries are counted, not listed */
export const MAX_LEDGER_ENTRIES = 15;

const NOUNS: Record<string, string> = {
  write_file: "write of",
  edit_file: "edit of",
  create_directory: "creating folder",
  move_file: "move of",
  delete_file: "delete of",
};

const VERBS: Record<string, string> = {
  write_file: "wrote",
  edit_file: "edited",
  create_directory: "created folder",
  move_file: "moved",
  delete_file: "moved to the Recycle Bin",
};

function isLedgerTool(tool: string): boolean {
  return tool in VERBS || tool === "run_command";
}

/** The payload inside a <tool_result> envelope */
function body(content: string): string {
  const match = content.match(/<(result|error)>([\s\S]*?)<\/\1>/);
  return (match?.[2] ?? content).trim();
}

const firstLine = (text: string, max = 100) => {
  const line =
    text
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
};

/** A path as written, inside the project folder shown relative to it */
function shortPath(path: string, workspace?: string): string {
  if (!workspace) return path;
  const root = workspace.replace(/[\\/]+$/, "");
  const normalised = path.replace(/\//g, "\\");
  return normalised.toLowerCase().startsWith(`${root.toLowerCase()}\\`)
    ? normalised.slice(root.length + 1)
    : path;
}

function targetOf(
  args: Record<string, unknown>,
  fallback: string | undefined,
  workspace?: string
): string {
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : undefined;
  const command = text(args.command);
  if (command) {
    const line = command.trim().split("\n")[0]!;
    return `\`${line.length > 80 ? `${line.slice(0, 77)}...` : line}\``;
  }
  const source = text(args.source);
  const destination = text(args.destination);
  if (source && destination) {
    return `${shortPath(source, workspace)} to ${shortPath(destination, workspace)}`;
  }
  const path = text(args.path) ?? fallback;
  return path ? shortPath(path, workspace) : "";
}

/** A call the model made and the result that followed it */
interface Paired {
  tool: string;
  args: Record<string, unknown>;
  result: Message;
}

/** Each tool result in the chat, with the call it answered when known */
function pairedCalls(messages: Message[]): Paired[] {
  const pairs: Paired[] = [];
  messages.forEach((message, i) => {
    if (message.role !== "assistant") return;
    const results: Message[] = [];
    for (let j = i + 1; j < messages.length && messages[j]!.toolResult; j++) {
      results.push(messages[j]!);
    }
    if (results.length === 0) return;
    const calls: ToolCallRequest[] = extractToolCalls(message.content);
    results.forEach((result, k) => {
      const tool = result.toolResult!.tool;
      const call = calls[k]?.tool === tool ? calls[k] : undefined;
      pairs.push({ tool, args: call?.arguments ?? {}, result });
    });
  });
  return pairs;
}

/** A repeat answered from the turn's earlier result is not a new action */
const isFresh = (result: Message) =>
  result.content.trimStart().startsWith("<tool_result");

/** Bounced before anything ran, or declined: nothing was attempted */
const notAttempted = (text: string) =>
  /^Not run: |The call was not run|User denied permission/.test(text);

/** An edit_file call that failed: where, and what it meant to change */
export interface FailedEdit {
  path: string;
  oldTexts: string[];
  newTexts: string[];
}

function failedEditOf({ tool, args, result }: Paired): FailedEdit | null {
  const info = result.toolResult!;
  if (tool !== "edit_file" || info.success || info.blocked) return null;
  if (!isFresh(result) || notAttempted(body(result.content))) return null;
  const path = typeof args.path === "string" ? args.path : info.target;
  if (!path) return null;
  const edits = Array.isArray(args.edits)
    ? (args.edits as { oldText?: unknown; newText?: unknown }[])
    : [];
  const texts = (key: "oldText" | "newText") =>
    edits
      .map((edit) => edit[key])
      .filter((value): value is string => typeof value === "string");
  return { path, oldTexts: texts("oldText"), newTexts: texts("newText") };
}

/** Every failed edit in the chat, each once */
export function failedEdits(messages: Message[]): FailedEdit[] {
  const seen = new Set<string>();
  const edits: FailedEdit[] = [];
  for (const pair of pairedCalls(messages)) {
    const edit = failedEditOf(pair);
    if (!edit) continue;
    const key = `${edit.path.toLowerCase()}\n${edit.newTexts.join("\n")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edits.push(edit);
  }
  return edits;
}

/**
 * True when `text`'s lines appear in `content` in a row, compared trimmed
 * and without blank lines - as the filesystem server's whitespace-tolerant
 * match would find them.
 */
export function containsLines(content: string, text: string): boolean {
  const lines = (s: string) =>
    s
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const want = lines(text);
  if (want.length === 0) return true;
  const have = lines(content);
  for (let i = 0; i + want.length <= have.length; i++) {
    if (want.every((line, j) => have[i + j] === line)) return true;
  }
  return false;
}

/** Files' current contents, by path as the model wrote it */
export type FileContents = Map<string, string>;

/**
 * Whether a failed edit's change is in its file now (made later by another
 * call), or undefined when the file was not read. A deletion - an empty
 * newText - counts as made when the old text is gone.
 */
export function isApplied(
  edit: FailedEdit,
  files: FileContents
): boolean | undefined {
  const content = files.get(edit.path);
  if (content === undefined) return undefined;
  const added = edit.newTexts.filter((text) => text.trim());
  if (added.length > 0) {
    return added.every((text) => containsLines(content, text));
  }
  return edit.oldTexts.every((text) => !containsLines(content, text));
}

/**
 * Reads the files of the chat's failed edits, so the record can say whether
 * each change is in the file now. Asked whether its failed GUID edit was
 * applied, Qwen3-Coder read set-radio.ps1, found the old GUID code its edit
 * had meant to replace, and answered "properly applied" (2026-09-28): a
 * model can read the file and still not see that its change is missing.
 */
export async function readFailedEditFiles(
  messages: Message[],
  readFile: (path: string) => Promise<string | null>
): Promise<FileContents> {
  const files: FileContents = new Map();
  for (const edit of failedEdits(messages)) {
    if (files.has(edit.path)) continue;
    const content = await readFile(edit.path).catch(() => null);
    if (content !== null) files.set(edit.path, content);
  }
  return files;
}

/** One line of the record for one call, or null when it adds nothing */
function describe(
  pair: Paired,
  workspace?: string,
  files?: FileContents
): string | null {
  const { tool, args, result } = pair;
  if (!isFresh(result)) return null;
  const info = result.toolResult!;
  const text = body(result.content);
  const target = targetOf(args, info.target, workspace);
  const isCommand = tool === "run_command";
  const subject = isCommand ? target : `${NOUNS[tool]} ${target}`;

  if (info.blocked) {
    return /^Plan mode/.test(text)
      ? `${subject} - planned only, not done`
      : `${subject} - refused in Read-only mode, not done`;
  }
  if (!info.success) {
    // The call was bounced before anything ran (a missing reason, arguments
    // that were not JSON); the model sends it again
    if (/^Not run: |The call was not run/.test(text)) return null;
    if (/User denied permission/.test(text)) {
      return `${subject} - declined by the user, not done`;
    }
    if (isCommand) return `${subject} - did not finish: ${firstLine(text)}`;
    const tried =
      tool === "edit_file" && Array.isArray(args.edits)
        ? (args.edits as { oldText?: unknown }[])
            .map((edit) =>
              typeof edit.oldText === "string"
                ? firstLine(edit.oldText, 60)
                : ""
            )
            .filter(Boolean)
        : [];
    const where = tried.length
      ? `; it tried to replace text starting "${tried[0]}"`
      : "";
    const edit = failedEditOf(pair);
    const applied = edit && files ? isApplied(edit, files) : undefined;
    if (applied === true) {
      return `${subject} FAILED at first (${firstLine(text)})${where} - but the file now has its new text`;
    }
    const checked =
      applied === false
        ? ". Checked just now: the file still does not have the new text, so this change is NOT in the file"
        : "";
    return `${subject} FAILED - nothing changed (${firstLine(text)})${where}${checked}`;
  }
  if (isCommand) {
    const run = text.match(/^Exit code (\S+) · /);
    const flagged = text.match(/\[Exit code 0, but (\d+) lines? of the output/);
    const exit = run ? `exit ${run[1]}` : "finished";
    return flagged
      ? `ran ${target} - ${exit}, but ${flagged[1]} line${flagged[1] === "1" ? "" : "s"} looked like failures`
      : `ran ${target} - ${exit}`;
  }
  return `${VERBS[tool]} ${target}`;
}

/**
 * The record's lines, oldest first: each change or command the model
 * made, paired with the result that followed it.
 */
export function ledgerEntries(
  messages: Message[],
  workspace?: string,
  files?: FileContents
): string[] {
  const lines: string[] = [];
  for (const pair of pairedCalls(messages)) {
    if (!isLedgerTool(pair.tool)) continue;
    const line = describe(pair, workspace, files);
    if (!line) continue;
    // "wrote a.md" three times in a row reads as one line
    const last = lines.at(-1);
    const repeat = last?.match(/^(.*) \((\d+) times\)$/);
    if (last === line) lines[lines.length - 1] = `${line} (2 times)`;
    else if (repeat?.[1] === line) {
      lines[lines.length - 1] = `${line} (${Number(repeat[2]) + 1} times)`;
    } else lines.push(line);
  }
  return lines;
}

/** Says a change was made, fixed, applied or works */
const CLAIM =
  /\b(appl(y|ied|ies)|fix(ed|es)?|implemented|in place|resolved|works?|working|success(ful|fully)?|complete[d]?|done|updated|corrected)\b/i;

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * A note for the user under a reply that talks about a change which never
 * made it into the file: the reply names the file of an unapplied failed
 * edit and says something was applied, fixed or done. Whatever the model
 * concluded, the user sees what the record shows.
 */
export function recordNoteFor(
  answer: string,
  messages: Message[],
  files: FileContents,
  workspace?: string
): string {
  if (!CLAIM.test(answer)) return "";
  const lowered = answer.toLowerCase();
  const missing = failedEdits(messages).filter(
    (edit) =>
      isApplied(edit, files) === false &&
      lowered.includes(baseName(edit.path).toLowerCase())
  );
  if (missing.length === 0) return "";
  const parts = missing.map((edit) => {
    const from = edit.oldTexts[0] ? firstLine(edit.oldTexts[0], 60) : "";
    return `an edit of ${shortPath(edit.path, workspace)}${from ? ` (replacing "${from}")` : ""} failed, and the file still does not have its change`;
  });
  return `SHIELD's record: ${parts.join("; ")}.`;
}

/** Files the model wrote or edited in the conversation, as it named them */
export function modelWrittenFiles(messages: Message[]): string[] {
  const paths: string[] = [];
  for (const message of messages) {
    const info = message.toolResult;
    if (!info?.success || !info.target) continue;
    if (info.tool !== "write_file" && info.tool !== "edit_file") continue;
    if (!message.content.trimStart().startsWith("<tool_result")) continue;
    paths.push(info.target);
  }
  return paths;
}

/** The note sent with the user's message, or "" when there is nothing */
export function ledgerNote(entries: string[]): string {
  if (entries.length === 0) return "";
  const dropped = Math.max(0, entries.length - MAX_LEDGER_ENTRIES);
  const listed = entries.slice(dropped).map((line) => `- ${line}`);
  if (dropped > 0) {
    listed.unshift(
      `- (${dropped} earlier entr${dropped === 1 ? "y" : "ies"} not listed)`
    );
  }
  return `[SHIELD's record of the changes and commands in this conversation, from the tools' actual results - not from your replies. Where an earlier reply of yours says otherwise, this record is right; if it matters, tell the user:\n${listed.join("\n")}]`;
}

/**
 * The record last sent to the model, per conversation, so an unchanged one
 * is not sent again with every message. Forgotten when the model's history
 * is rebuilt from the saved chat, which holds only what the user typed.
 */
const lastSent = new Map<string, string>();

/** The note to send now, or "" when the model already has this record */
export function takeLedgerNote(
  conversationId: string,
  messages: Message[],
  workspace?: string,
  files?: FileContents
): string {
  const note = ledgerNote(ledgerEntries(messages, workspace, files));
  if (!note || lastSent.get(conversationId) === note) return "";
  lastSent.set(conversationId, note);
  return note;
}

export function forgetLedgerSent(conversationId?: string): void {
  if (conversationId) lastSent.delete(conversationId);
  else lastSent.clear();
}
