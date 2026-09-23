/**
 * Generation Store
 *
 * The numbers shown around the chat: how fast the last reply was generated
 * (under each assistant message) and how full the context window is (the
 * ring next to the composer). Kept out of useLlama's return value so the
 * message pipeline can read the latest stats without threading them through.
 */

import { create } from "zustand";
import type { ContextUsage, GenerationStats } from "@/types/electron";

interface GenerationStore {
  lastStats: GenerationStats | null;
  context: ContextUsage | null;
  record: (
    stats: GenerationStats | null | undefined,
    context: ContextUsage | null | undefined
  ) => void;
  setContext: (context: ContextUsage | null | undefined) => void;
  /** Ask the main process, e.g. after loading a model or switching chats */
  refreshContext: () => Promise<void>;
}

export const useGenerationStore = create<GenerationStore>((set) => ({
  lastStats: null,
  context: null,
  record: (stats, context) =>
    set({ lastStats: stats ?? null, context: context ?? null }),
  setContext: (context) => set({ context: context ?? null }),
  refreshContext: async () => {
    try {
      const result = await window.llama.getContextUsage();
      set({ context: result.context ?? null });
    } catch {
      // Purely informational - never let it break the chat
    }
  },
}));
