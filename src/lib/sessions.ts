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

/** A project's conversations, keeping the list's order */
export function inProject<T extends { projectId?: string }>(
  conversations: T[],
  projectId: string
): T[] {
  return conversations.filter((c) => c.projectId === projectId);
}

/**
 * Conversations under no project - or under one that no longer exists -
 * listed below the projects
 */
export function outsideProjects<T extends { projectId?: string }>(
  conversations: T[],
  projects: { id: string }[]
): T[] {
  const ids = new Set(projects.map((p) => p.id));
  return conversations.filter((c) => !c.projectId || !ids.has(c.projectId));
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
