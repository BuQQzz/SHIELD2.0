/**
 * Chat and Code sessions
 *
 * Chat is plain conversation; Code is a session on a project folder with
 * the file tools. Both are conversations, told apart by their kind, and
 * each view lists and opens only its own.
 */

import type { ConversationKind } from "@/types/conversation";
import type { AppView } from "@/stores/chat-store";
import { getModelById } from "@/config/models";

/** The kind of session a view shows; the library and plugins show none */
export function viewKind(view: AppView): ConversationKind | null {
  if (view === "code") return "code";
  if (view === "chat") return "chat";
  return null;
}

/** Conversations from before the split have no kind: they are chats */
export function kindOf(
  conversation: { kind?: ConversationKind } | null | undefined
): ConversationKind {
  return conversation?.kind ?? "chat";
}

/** The conversations of one kind, keeping the list's order */
export function ofKind<T extends { kind?: ConversationKind }>(
  conversations: T[],
  kind: ConversationKind
): T[] {
  return conversations.filter((conversation) => kindOf(conversation) === kind);
}

/** Last path segment, for labels: "C:\\Continue\\wifi" is "wifi" */
export function folderName(folder: string): string {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}

/** Made for coding or agent work, by the catalog's roles */
export function isCodingModel(modelId: string | undefined): boolean {
  const roles = modelId ? getModelById(modelId)?.roles : undefined;
  return !!roles && (roles.includes("coding") || roles.includes("agent"));
}
