/**
 * Turns
 *
 * The stored conversation is a flat list: user message, assistant text, tool
 * result, assistant text, tool result... Shown that way, every step of one
 * reply got its own "SHIELD Assistant" header and a boxed tool row, so a
 * single request read as a dozen separate messages. Here the list becomes
 * turns - what the user said, then everything SHIELD did in reply - and runs
 * of tool calls inside a reply become one collapsible group.
 */

import type { Message } from "@/types/conversation";
import { stripToolCallMarkup } from "@/handlers/toolCallParsing";

export type TurnPart =
  { kind: "text"; message: Message } | { kind: "tools"; messages: Message[] };

export type Turn =
  | { kind: "user"; message: Message }
  | { kind: "assistant"; id: string; messages: Message[]; parts: TurnPart[] };

/**
 * A reply that was nothing but a tool call, followed by that call's result.
 * It shows nothing, so it must not split a run of steps: "Created folder
 * controllers" and "Created folder routes" stayed two lines instead of
 * "Created 2 folders" (2026-09-24).
 */
function isBareCall(message: Message, next: Message | undefined): boolean {
  return (
    message.role === "assistant" &&
    !message.thinking &&
    Boolean(next?.toolResult) &&
    stripToolCallMarkup(message.content).trim() === ""
  );
}

/** Consecutive tool results sit together; text between them splits them */
function toParts(messages: Message[]): TurnPart[] {
  const parts: TurnPart[] = [];
  for (const [i, message] of messages.entries()) {
    if (isBareCall(message, messages[i + 1])) continue;
    const last = parts.at(-1);
    if (message.toolResult) {
      if (last?.kind === "tools") last.messages.push(message);
      else parts.push({ kind: "tools", messages: [message] });
    } else {
      parts.push({ kind: "text", message });
    }
  }
  return parts;
}

export function groupIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let reply: Message[] = [];

  const flush = () => {
    if (reply.length === 0) return;
    turns.push({
      kind: "assistant",
      id: reply[0]!.id,
      messages: reply,
      parts: toParts(reply),
    });
    reply = [];
  };

  for (const message of messages) {
    // Tool results are stored on the user role (the chat template wants
    // them there), but they belong to the reply
    if (message.role === "user" && !message.toolResult) {
      flush();
      turns.push({ kind: "user", message });
    } else {
      reply.push(message);
    }
  }
  flush();
  return turns;
}

/** Last segment of a Windows or POSIX path; "." stays as is */
export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed.split(/[\\/]/).pop() || trimmed || path;
}

interface Verb {
  done: string;
  running: string;
  /** For a group of this tool: "Read 3 files" */
  noun?: [singular: string, plural: string];
  /** How the target reads in the label; default: the file's name */
  target?: (value: string) => string;
}

/** "example.com/docs/intro" - enough to recognise the page */
export function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "");
    const short = `${url.hostname.replace(/^www\./, "")}${path}`;
    return short.length > 60 ? `${short.slice(0, 57)}...` : short;
  } catch {
    return value;
  }
}

const VERBS: Record<string, Verb> = {
  read_file: { done: "Read", running: "Reading", noun: ["file", "files"] },
  read_text_file: { done: "Read", running: "Reading", noun: ["file", "files"] },
  read_media_file: {
    done: "Read",
    running: "Reading",
    noun: ["file", "files"],
  },
  read_multiple_files: { done: "Read", running: "Reading" },
  write_file: { done: "Wrote", running: "Writing", noun: ["file", "files"] },
  edit_file: { done: "Edited", running: "Editing", noun: ["file", "files"] },
  create_directory: {
    done: "Created folder",
    running: "Creating folder",
    noun: ["folder", "folders"],
  },
  list_directory: {
    done: "Listed",
    running: "Listing",
    noun: ["folder", "folders"],
  },
  list_directory_with_sizes: {
    done: "Listed",
    running: "Listing",
    noun: ["folder", "folders"],
  },
  directory_tree: { done: "Mapped", running: "Mapping" },
  move_file: { done: "Moved", running: "Moving", noun: ["file", "files"] },
  search_files: { done: "Searched", running: "Searching" },
  get_file_info: { done: "Checked", running: "Checking" },
  delete_file: {
    done: "Moved to Recycle Bin",
    running: "Moving to Recycle Bin",
    noun: ["item", "items"],
  },
  list_allowed_directories: {
    done: "Listed allowed folders",
    running: "Listing allowed folders",
  },
  web_search: {
    done: "Searched the web for",
    running: "Searching the web for",
    noun: ["search", "searches"],
    target: (query) => `"${query}"`,
  },
  fetch_page: {
    done: "Read",
    running: "Reading",
    noun: ["page", "pages"],
    target: shortUrl,
  },
};

/** Group headings use a noun where the one-step verb names the thing */
const GROUP_VERB: Record<string, string> = {
  create_directory: "Created",
  delete_file: "Moved to Recycle Bin:",
  web_search: "Ran",
};

/**
 * "Wrote index.html", "Reading app.js", or "filesystem.fetch" for a tool
 * SHIELD has no wording for.
 */
export function stepLabel(
  tool: string,
  serverName: string,
  target: string | undefined,
  state: "done" | "running"
): string {
  const verb = VERBS[tool];
  if (!verb) return `${serverName}.${tool}`;
  const word = state === "running" ? verb.running : verb.done;
  if (!target) return word;
  return `${word} ${verb.target ? verb.target(target) : baseName(target)}`;
}

/** "Created 2 folders", "Read 3 files", else "Used 4 tools" */
export function groupLabel(messages: Message[]): string {
  const tools = new Set(messages.map((m) => m.toolResult?.tool));
  const count = messages.length;
  if (tools.size === 1) {
    const tool = [...tools][0]!;
    const verb = VERBS[tool];
    if (verb?.noun) {
      const noun = count === 1 ? verb.noun[0] : verb.noun[1];
      return `${GROUP_VERB[tool] ?? verb.done} ${count} ${noun}`;
    }
  }
  return `Used ${count} tools`;
}

/** Pull the readable payload out of the <tool_result> envelope */
export function resultBody(content: string): string {
  const result = content.match(/<result>([\s\S]*?)<\/result>/);
  if (result?.[1]) return result[1].trim();
  const error = content.match(/<error>([\s\S]*?)<\/error>/);
  if (error?.[1]) return error[1].trim();
  return content.trim();
}

/** "+4 −2" from edit_file's unified diff, or null if it is not one */
export function diffStat(body: string): string | null {
  if (!/^@@ /m.test(body)) return null;
  let added = 0;
  let removed = 0;
  for (const line of body.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added++;
    else if (line.startsWith("-")) removed++;
  }
  return `+${added} −${removed}`;
}

/** Short muted detail after the label; "" when the label says it all */
export function stepDetail(
  tool: string,
  body: string,
  success: boolean
): string {
  if (!success) return body.split("\n")[0]?.slice(0, 100) ?? "failed";
  if (/^Successfully (wrote|created)/i.test(body)) return "";

  const diff = tool === "edit_file" ? diffStat(body) : null;
  if (diff) return diff;

  if (tool === "web_search") {
    const results = (body.match(/^\d+\. /gm) ?? []).length;
    return results
      ? `${results} result${results === 1 ? "" : "s"}`
      : "no results";
  }
  if (tool === "fetch_page") {
    const part = body.match(/\[Characters ([\d,]+)-([\d,]+) of ([\d,]+)/);
    return part ? `characters ${part[1]}-${part[2]} of ${part[3]}` : "";
  }

  const files = (body.match(/\[FILE\]/g) ?? []).length;
  const dirs = (body.match(/\[DIR\]/g) ?? []).length;
  if (files || dirs) {
    const parts = [];
    if (files) parts.push(`${files} file${files === 1 ? "" : "s"}`);
    if (dirs) parts.push(`${dirs} folder${dirs === 1 ? "" : "s"}`);
    return parts.join(", ");
  }

  const lines = body.split("\n").length;
  return body.length > 120
    ? `${lines.toLocaleString("en-US")} line${lines === 1 ? "" : "s"}`
    : body.split("\n")[0]!.slice(0, 80);
}

export interface TurnStats {
  outputTokens: number;
  tokensPerSecond: number;
  durationMs: number;
}

/** One line for the whole reply: every generation in it, summed */
export function turnStats(messages: Message[]): TurnStats | null {
  let outputTokens = 0;
  let durationMs = 0;
  for (const m of messages) {
    if (!m.stats || m.stats.outputTokens <= 0) continue;
    outputTokens += m.stats.outputTokens;
    durationMs += m.stats.durationMs;
  }
  if (outputTokens === 0 || durationMs <= 0) return null;
  return {
    outputTokens,
    durationMs,
    tokensPerSecond: outputTokens / (durationMs / 1000),
  };
}
