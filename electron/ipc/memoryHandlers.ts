import { app, ipcMain } from "electron";
import fs from "fs";
import path from "path";
import { ConversationStorageService } from "../services/ConversationStorageService.js";
import { MemoryIndex } from "../services/memory/memoryIndex.js";
import type { MemoryConversation } from "../services/memory/memoryEntries.js";
import { MemoryNotesStore } from "../services/memory/memoryNotesStore.js";
import { setMemoryHooks } from "../../src/services/LlamaServerProvider.js";
import {
  CHECKS_PER_SESSION,
  fileAnchors,
  folderScope,
  notesForPrompt,
  notesFromSummary,
  notesSection,
  outdatedNumbers,
  userNotesFrom,
  type NoteKind,
  type NoteScope,
} from "../../src/config/memoryNotes.js";

let index: MemoryIndex | null = null;

/** SHIELD's memory index, in its app data folder */
export function getMemoryIndex(): MemoryIndex {
  index ??= new MemoryIndex(
    path.join(app.getPath("userData"), "memory", "memory.db")
  );
  return index;
}

let notes: MemoryNotesStore | null = null;

/** SHIELD's memory notes, in their own file next to the index */
export function getMemoryNotes(): MemoryNotesStore {
  notes ??= new MemoryNotesStore(
    path.join(app.getPath("userData"), "memory", "notes.db")
  );
  return notes;
}

/**
 * Whose notes the open conversation reads and the remember tool writes:
 * its folder in a code session, the user's in a chat. Set by the renderer
 * when the open conversation changes (memory:set-scope).
 */
let scope: NoteScope = "user";

export function getMemoryScope(): NoteScope {
  return scope;
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

/** File names in a folder, a few levels deep, for the staleness check */
function filesIn(folder: string, depth = 3): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string, level: number) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        /^(\.git|node_modules|__pycache__|\.venv|venv|dist)$/.test(entry.name)
      )
        continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (level < depth) walk(full, level + 1);
      } else {
        names.add(entry.name);
        names.add(path.relative(folder, full).split(path.sep).join("/"));
      }
    }
  };
  walk(folder, 0);
  return names;
}

/**
 * Notes of the folder that name a file it no longer has are marked as
 * possibly out of date, for the user's memory check. No model, no reading
 * of file contents: names only.
 */
export async function flagMissingFiles(
  store: MemoryNotesStore,
  folder: string
): Promise<number> {
  const sessionScope = folderScope(folder);
  const notes = (await store.forScope(sessionScope)).filter(
    (note) => note.scope === sessionScope && note.status === "active"
  );
  const withFiles = notes.filter((note) => fileAnchors(note.anchors).length);
  if (withFiles.length === 0) return 0;
  const files = filesIn(folder);
  if (files.size === 0) return 0;
  let flagged = 0;
  for (const note of withFiles) {
    const missing = fileAnchors(note.anchors).find((anchor) => {
      const name = anchor.split("/").pop()!;
      return anchor.includes("<")
        ? !files.has(name)
        : !files.has(anchor.replace(/^\.\//, "")) && !files.has(name);
    });
    if (!missing) continue;
    const reason = `${missing.split("/").pop()} is not in the project`;
    if (await store.setStatus(note.id, "stale", reason)) flagged++;
  }
  return flagged;
}

/** Notes the summary request asks about: the project's newest few */
const CHECKED_NOTES = 8;

/**
 * What a summary note means for memory: notes the model says its work
 * showed wrong are marked as possibly out of date (the user decides at the
 * next session's memory check), and its Facts and Decisions are saved as
 * the project's notes. Project notes only: a chat's summary is about the
 * conversation, not the user.
 */
export async function noteFromSummary(
  store: MemoryNotesStore,
  sessionScope: NoteScope,
  note: string,
  checked: { id: string; text: string }[]
): Promise<{ stale: number; saved: string[] }> {
  if (sessionScope === "user") return { stale: 0, saved: [] };
  let stale = 0;
  for (const i of outdatedNumbers(note, checked.length)) {
    const reason = "the last session's work suggested it changed";
    if (await store.setStatus(checked[i]!.id, "stale", reason)) stale++;
  }
  const saved: string[] = [];
  for (const candidate of notesFromSummary(
    note,
    sessionScope.slice("folder:".length)
  )) {
    const result = await store.merge(sessionScope, candidate);
    if (result && result.action !== "confirmed") {
      saved.push(`${result.action}: ${candidate.text}`);
    }
  }
  return { stale, saved };
}

export function registerMemoryHandlers(): void {
  setMemoryHooks({
    notesToCheck: async () => {
      if (scope === "user") return [];
      const notes = await getMemoryNotes().forScope(scope);
      return notes
        .filter((note) => note.scope === scope)
        .slice(0, CHECKED_NOTES)
        .map(({ id, text }) => ({ id, text }));
    },
    onNote: (note, checked) => {
      noteFromSummary(getMemoryNotes(), scope, note, checked)
        .then(({ stale, saved }) => {
          if (stale || saved.length) {
            console.log(
              `[Memory] From the summary: ${stale} note(s) marked possibly out of date; ${saved.length} saved${saved.length ? `\n  ${saved.join("\n  ")}` : ""}`
            );
          }
        })
        .catch((error) =>
          console.error("[Memory] Could not keep the summary's notes:", error)
        );
    },
  });

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

  // Memory notes (src/config/memoryNotes.ts): Settings › Memory and the
  // prompt's "What you remember" section
  const failure = (error: unknown) => ({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  });
  ipcMain.handle("memory:set-scope", (_event, folder: string | null) => {
    scope = folderScope(folder);
    return { success: true, scope };
  });
  ipcMain.handle("memory:notes-list", async () => {
    try {
      return { success: true, notes: await getMemoryNotes().list() };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle(
    "memory:notes-add",
    async (
      _event,
      input: { folder?: string | null; kind: NoteKind; text: string }
    ) => {
      try {
        const result = await getMemoryNotes().add({
          scope: folderScope(input.folder),
          kind: input.kind,
          text: input.text,
        });
        return result.ok
          ? { success: true, note: result.note }
          : { success: false, error: result.reason };
      } catch (error) {
        return failure(error);
      }
    }
  );
  ipcMain.handle(
    "memory:notes-edit",
    async (_event, id: string, change: { text?: string; kind?: NoteKind }) => {
      try {
        const result = await getMemoryNotes().edit(id, change);
        return result.ok
          ? { success: true, note: result.note }
          : { success: false, error: result.reason };
      } catch (error) {
        return failure(error);
      }
    }
  );
  ipcMain.handle(
    "memory:notes-status",
    async (_event, id: string, status: "active" | "stale") => {
      try {
        return {
          success: await getMemoryNotes().setStatus(id, status),
        };
      } catch (error) {
        return failure(error);
      }
    }
  );
  ipcMain.handle("memory:notes-trash", async (_event, id: string) => {
    try {
      return { success: await getMemoryNotes().trash(id) };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle("memory:notes-restore", async (_event, id: string) => {
    try {
      return { success: await getMemoryNotes().restore(id) };
    } catch (error) {
      return failure(error);
    }
  });
  ipcMain.handle("memory:notes-empty-trash", async () => {
    try {
      return { success: true, removed: await getMemoryNotes().emptyTrash() };
    } catch (error) {
      return failure(error);
    }
  });
  // What the user said about themselves in a message they sent: saved as
  // their notes, each shown with an Undo (MemoryCheckCard)
  ipcMain.handle("memory:notes-from-user", async (_event, message: string) => {
    try {
      const store = getMemoryNotes();
      const saved = [];
      for (const candidate of userNotesFrom(String(message ?? ""))) {
        const result = await store.merge("user", candidate);
        if (result?.note && result.action !== "confirmed") {
          saved.push({
            id: result.note.id,
            text: result.note.text,
            replaces: result.note.replaces,
          });
        }
      }
      return { success: true, saved };
    } catch (error) {
      return failure(error);
    }
  });

  // The section a session's prompt starts with; read once per session, so
  // a note saved mid-session changes no prompt the server has cached
  ipcMain.handle(
    "memory:notes-section",
    async (_event, folder: string | null) => {
      try {
        const store = getMemoryNotes();
        const sessionScope = folderScope(folder);
        if (folder) await flagMissingFiles(store, folder).catch(() => 0);
        const all = await store.forScope(sessionScope);
        const picked = notesForPrompt(all, sessionScope);
        await store.markUsed(picked.map((note) => note.id));
        return {
          success: true,
          section: notesSection(
            picked,
            sessionScope,
            all.length - picked.length
          ),
          count: picked.length,
          // For the memory check card: the ones to ask about this session
          toCheck: all
            .filter((note) => note.status === "stale")
            .slice(0, CHECKS_PER_SESSION),
        };
      } catch (error) {
        return failure(error);
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
