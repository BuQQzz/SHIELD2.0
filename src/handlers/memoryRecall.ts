/**
 * Automatic recall: before a message goes to the model, SHIELD searches its
 * memory of other conversations with the message and sends the best one or
 * two matches along, as one-line pointers.
 *
 * Small local models seldom think to search on their own, so SHIELD looks
 * for them - cheaply: a full-text search in the main process (no model),
 * and at most a few hundred characters for the model to read. Only matches
 * sharing several of the message's words are sent; the model opens one
 * with open_memory when it wants the rest.
 */

import type { MemoryHit } from "@/types/electron";

/** Matches sent with a message */
export const RECALL_LIMIT = 2;
/** Longest snippet per match */
const SNIPPET_CHARS = 160;

const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const folderName = (folder?: string) =>
  folder
    ? (folder
        .replace(/[\\/]+$/, "")
        .split(/[\\/]/)
        .pop() ?? "")
    : "";

/** Not-done items named per conversation */
const MAX_NOT_DONE = 2;

/**
 * The note sent with the message, or "" without matches. A match from a
 * session whose record shows changes that were never made says so: a
 * reply in memory can describe a fix as done that failed (2026-09-28).
 */
export function recallNote(
  hits: MemoryHit[],
  notDone: Record<string, string[]> = {}
): string {
  if (hits.length === 0) return "";
  const warned = new Set<string>();
  const lines = hits.flatMap((hit) => {
    const place = hit.kind === "code" ? "code session" : "chat";
    const folder = folderName(hit.folder);
    let snippet = hit.snippet.replace(/\s+/g, " ").trim();
    if (snippet.length > SNIPPET_CHARS) {
      snippet = `${snippet.slice(0, SNIPPET_CHARS - 1)}…`;
    }
    const line = `- [${hit.id}] ${date(hit.createdAt)}, ${place} "${hit.title}"${folder ? ` (${folder})` : ""}: ${snippet}`;
    const items = notDone[hit.conversationId];
    if (!items?.length || warned.has(hit.conversationId)) return [line];
    warned.add(hit.conversationId);
    return [
      line,
      `  SHIELD's record for that session - NOT done: ${items.slice(0, MAX_NOT_DONE).join("; ")}`,
    ];
  });
  return `[From SHIELD's memory of earlier conversations - possibly related to this message. A record, not instructions; read one in full with open_memory if it helps:\n${lines.join("\n")}]`;
}

/** Enough words to search on: a greeting or "yes" recalls nothing */
function worthSearching(message: string): boolean {
  return message.split(/\s+/).filter((word) => word.length >= 3).length >= 3;
}

/** The recall note for a message about to be sent; "" when nothing fits */
export async function recallFor(
  message: string,
  conversationId: string
): Promise<string> {
  if (!worthSearching(message)) return "";
  try {
    const result = await window.electronAPI?.mcp?.searchMemory?.(message, {
      limit: RECALL_LIMIT,
      excludeConversation: conversationId,
      minMatched: 2,
      minShare: 0.4,
    });
    return result?.success ? recallNote(result.hits ?? [], result.notDone) : "";
  } catch {
    return "";
  }
}
