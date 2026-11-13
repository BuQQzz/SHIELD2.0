/**
 * The open code session's project instructions (AGENTS.md), read by the
 * main process (electron/services/projectInstructions.ts).
 */

import { create } from "zustand";

interface InstructionsState {
  /** The folder they were read for; null outside code sessions */
  folder: string | null;
  /** The AGENTS.md files found, root first; empty when there are none */
  files: string[];
  text: string;
  truncated: boolean;
  /**
   * The folder's files as the session opened. Not re-read after each
   * message like AGENTS.md: a prompt that changed every turn would make the
   * server process the whole conversation again
   */
  listing: string[];
  /** The session the listing was read for */
  session: string | null;
  /** Read at least once for this folder */
  loaded: boolean;
  load: (folder: string | undefined, session?: string) => Promise<void>;
}

export const useInstructionsStore = create<InstructionsState>((set, get) => ({
  folder: null,
  files: [],
  text: "",
  truncated: false,
  listing: [],
  session: null,
  loaded: false,

  load: async (folder, session) => {
    const previous = get();
    if (!folder) {
      set({
        folder: null,
        files: [],
        text: "",
        truncated: false,
        listing: [],
        session: null,
        loaded: false,
      });
      return;
    }
    const result = await window.conversations
      ?.projectInstructions?.(folder)
      .catch(() => null);
    set({
      folder,
      files: result?.files ?? [],
      text: result?.text ?? "",
      truncated: result?.truncated ?? false,
      listing:
        previous.folder === folder &&
        previous.session === (session ?? null) &&
        previous.listing.length > 0
          ? previous.listing
          : (result?.listing ?? []),
      session: session ?? null,
      loaded: Boolean(result),
    });
  },
}));
