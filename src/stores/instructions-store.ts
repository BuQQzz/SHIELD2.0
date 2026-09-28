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
  /** Read at least once for this folder */
  loaded: boolean;
  load: (folder: string | undefined) => Promise<void>;
}

export const useInstructionsStore = create<InstructionsState>((set) => ({
  folder: null,
  files: [],
  text: "",
  truncated: false,
  loaded: false,

  load: async (folder) => {
    if (!folder) {
      set({
        folder: null,
        files: [],
        text: "",
        truncated: false,
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
      loaded: Boolean(result),
    });
  },
}));
