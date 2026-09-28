import { app, ipcMain } from "electron";
import path from "path";
import { ConversationStorageService } from "../services/ConversationStorageService.js";
import { MemoryIndex } from "../services/memory/memoryIndex.js";
import type { MemoryConversation } from "../services/memory/memoryEntries.js";

let index: MemoryIndex | null = null;

/** SHIELD's memory index, in its app data folder */
export function getMemoryIndex(): MemoryIndex {
  index ??= new MemoryIndex(
    path.join(app.getPath("userData"), "memory", "memory.db")
  );
  return index;
}

/** Index a conversation as it was just saved; failures only log */
export function indexConversation(conversation: MemoryConversation): void {
  getMemoryIndex()
    .indexConversation(conversation)
    .catch((error) =>
      console.error("[Memory] Could not index conversation:", error)
    );
}

export function forgetConversation(conversationId: string): void {
  getMemoryIndex()
    .removeConversation(conversationId)
    .catch((error) =>
      console.error("[Memory] Could not remove conversation:", error)
    );
}

/**
 * Indexes every saved conversation that changed since it was last indexed
 * (all of them the first time), and drops deleted ones. Run in the
 * background after start-up; one conversation at a time.
 */
export async function syncMemoryIndex(
  storage = new ConversationStorageService()
): Promise<number> {
  const memory = getMemoryIndex();
  const versions = await memory.indexedVersions();
  const { conversations } = await storage.listConversations();
  let indexed = 0;
  for (const meta of conversations) {
    const version = new Date(meta.updatedAt).getTime();
    if (versions.get(meta.id) === version) continue;
    const { conversation } = await storage.loadConversation(meta.id);
    if (!conversation) continue;
    await memory.indexConversation(
      conversation as unknown as MemoryConversation
    );
    indexed++;
  }
  const saved = new Set(conversations.map((c) => c.id));
  for (const id of versions.keys()) {
    if (!saved.has(id)) await memory.removeConversation(id);
  }
  return indexed;
}

export function registerMemoryHandlers(): void {
  // The renderer's automatic recall: a couple of matches for the message
  // being sent, from other conversations
  ipcMain.handle(
    "memory:search",
    async (
      _event,
      query: string,
      options?: {
        limit?: number;
        excludeConversation?: string;
        minMatched?: number;
        minShare?: number;
      }
    ) => {
      try {
        const memory = getMemoryIndex();
        const hits = await memory.search(String(query ?? ""), {
          limit: Math.min(5, options?.limit ?? 3),
          excludeConversation: options?.excludeConversation,
          minMatched: options?.minMatched,
          minShare: options?.minShare,
        });
        // Changes those sessions' records show were never made
        const notDone = Object.fromEntries(
          await memory.notDoneFor(hits.map((hit) => hit.conversationId))
        );
        return { success: true, hits, notDone };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  // Catch up once the window is up, so start-up is not slowed
  setTimeout(() => {
    const started = Date.now();
    syncMemoryIndex()
      .then((count) =>
        console.log(
          `[Memory] Index up to date: ${count} conversation(s) indexed in ${Date.now() - started} ms`
        )
      )
      .catch((error) => console.error("[Memory] Index sync failed:", error));
  }, 5000);
}
