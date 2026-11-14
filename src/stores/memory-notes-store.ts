/**
 * The open conversation's memory notes as its prompt shows them
 * (src/config/memoryNotes.ts), read by the main process.
 *
 * Read once when a conversation opens, not after each message: a note
 * saved mid-session would change the system prompt, and the server would
 * read the whole conversation again. A new note shows from the next
 * session on.
 */

import { create } from "zustand";
import type { MemoryNote } from "@/config/memoryNotes";

interface MemoryNotesState {
  /** The conversation the section was read for */
  conversation: string | null;
  /** Its folder, or null in a chat */
  folder: string | null;
  section: string;
  count: number;
  /** Notes that may be out of date, for the memory check card */
  toCheck: MemoryNote[];
  /** The user answered about this note */
  checked: (id: string) => void;
  /** Notes just saved from the user's own words, shown with an Undo */
  remembered: { id: string; text: string; replaces?: string }[];
  fromMessage: (message: string) => Promise<void>;
  /** Undo a note saved from a message, bringing back any it replaced */
  undo: (id: string) => Promise<void>;
  dismiss: () => void;
  load: (
    conversation: string | undefined,
    folder: string | null
  ) => Promise<void>;
}

export const useMemoryNotesStore = create<MemoryNotesState>((set, get) => ({
  conversation: null,
  folder: null,
  section: "",
  count: 0,
  toCheck: [],
  remembered: [],

  fromMessage: async (message) => {
    const result = await window.electronAPI?.mcp?.notes
      ?.fromUser(message)
      .catch(() => null);
    const saved = result?.saved ?? [];
    if (saved.length > 0) set({ remembered: saved });
  },

  undo: async (id) => {
    const notes = window.electronAPI?.mcp?.notes;
    const note = get().remembered.find((n) => n.id === id);
    await notes?.trash(id).catch(() => undefined);
    if (note?.replaces)
      await notes?.restore(note.replaces).catch(() => undefined);
    set((state) => ({
      remembered: state.remembered.filter((n) => n.id !== id),
    }));
  },

  dismiss: () => set({ remembered: [] }),

  checked: (id) =>
    set((state) => ({
      toCheck: state.toCheck.filter((note) => note.id !== id),
    })),

  load: async (conversation, folder) => {
    const notes = window.electronAPI?.mcp?.notes;
    await notes?.setScope(folder).catch(() => undefined);
    const previous = get();
    if (!conversation) {
      set({ conversation: null, folder, section: "", count: 0, toCheck: [] });
      return;
    }
    if (previous.conversation === conversation && previous.folder === folder) {
      return;
    }
    const result = await notes?.section(folder).catch(() => null);
    set({
      conversation,
      folder,
      section: result?.success ? (result.section ?? "") : "",
      count: result?.count ?? 0,
      toCheck: result?.success ? (result.toCheck ?? []) : [],
    });
  },
}));
