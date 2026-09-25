/**
 * Generation Store
 *
 * The numbers shown around the chat: how fast the last reply was generated
 * (under each assistant message) and how full the context window is (the
 * ring next to the composer). Kept out of useLlama's return value so the
 * message pipeline can read the latest stats without threading them through.
 */

import { create } from "zustand";
import type {
  ChatProgress,
  ContextUsage,
  GenerationStats,
} from "@/types/electron";

interface GenerationStore {
  lastStats: GenerationStats | null;
  context: ContextUsage | null;
  /**
   * The summary the last request wrote to make room in the model's
   * history, if it had to; shown as a step in the reply
   */
  lastSummary: string | null;
  record: (
    stats: GenerationStats | null | undefined,
    context: ContextUsage | null | undefined,
    summary?: string | null
  ) => void;
  /** The request in progress: summarising, reading or writing, live */
  progress: ChatProgress | null;
  /** Also moves the context ring, which otherwise updates after a reply */
  setProgress: (progress: ChatProgress | null) => void;
  setContext: (context: ContextUsage | null | undefined) => void;
  /** Ask the main process, e.g. after loading a model or switching chats */
  refreshContext: () => Promise<void>;
  /**
   * The user pressed Stop during this turn. Stopping aborts only the reply
   * being generated; the tool loop reads this so it does not start another
   * round. Cleared when the next message is sent.
   */
  stopRequested: boolean;
  setStopRequested: (value: boolean) => void;
}

export const useGenerationStore = create<GenerationStore>((set) => ({
  lastStats: null,
  context: null,
  lastSummary: null,
  record: (stats, context, summary) =>
    set({
      lastStats: stats ?? null,
      context: context ?? null,
      lastSummary: summary ?? null,
    }),
  progress: null,
  setProgress: (progress) =>
    set((state) => ({
      progress,
      context:
        progress && progress.phase !== "summarising" && state.context
          ? { ...state.context, used: progress.contextUsed }
          : state.context,
    })),
  setContext: (context) => set({ context: context ?? null }),
  stopRequested: false,
  setStopRequested: (value) => set({ stopRequested: value }),
  refreshContext: async () => {
    try {
      const result = await window.llama.getContextUsage();
      set({ context: result.context ?? null });
    } catch {
      // Purely informational - never let it break the chat
    }
  },
}));
