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
  SavedCapsule,
} from "@/types/electron";

interface GenerationStore {
  lastStats: GenerationStats | null;
  context: ContextUsage | null;
  /**
   * The summary the last request wrote to make room in the model's
   * history, if it had to; shown as a step in the reply
   */
  lastSummary: string | null;
  /** The same summary, saved with the reply to restore from */
  lastCapsule: SavedCapsule | null;
  record: (
    stats: GenerationStats | null | undefined,
    context: ContextUsage | null | undefined,
    summary?: string | null,
    capsule?: SavedCapsule | null
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
  /**
   * The user skipped the running agent's step in the stuck bar. Ends that
   * agent's run only; cleared when the next agent starts.
   */
  skipRequested: boolean;
  setSkipRequested: (value: boolean) => void;
  /**
   * Messages the user sent while the turn ran, not yet delivered: the next
   * tool result takes them (handlers/steer.ts)
   */
  steer: string[];
  addSteer: (text: string) => void;
  /** The waiting messages, emptied */
  takeSteer: () => string[];
  /**
   * Messages queued while a turn ran, each sent as a turn of its own when
   * the one before ends (shown as chips above the input)
   */
  queue: string[];
  addQueued: (text: string) => void;
  removeQueued: (index: number) => void;
  /** The first queued message, taken off the queue */
  nextQueued: () => string | undefined;
  /** All of them, emptied */
  takeQueue: () => string[];
}

export const useGenerationStore = create<GenerationStore>((set, get) => ({
  lastStats: null,
  context: null,
  lastSummary: null,
  lastCapsule: null,
  record: (stats, context, summary, capsule) =>
    set({
      lastStats: stats ?? null,
      context: context ?? null,
      lastSummary: summary ?? null,
      lastCapsule: capsule ?? null,
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
  skipRequested: false,
  setSkipRequested: (value) => set({ skipRequested: value }),
  steer: [],
  addSteer: (text) => set((state) => ({ steer: [...state.steer, text] })),
  takeSteer: () => {
    const notes = get().steer;
    if (notes.length) set({ steer: [] });
    return notes;
  },
  queue: [],
  addQueued: (text) => set((state) => ({ queue: [...state.queue, text] })),
  removeQueued: (index) =>
    set((state) => ({ queue: state.queue.filter((_, i) => i !== index) })),
  nextQueued: () => {
    const [first, ...rest] = get().queue;
    if (first !== undefined) set({ queue: rest });
    return first;
  },
  takeQueue: () => {
    const all = get().queue;
    if (all.length) set({ queue: [] });
    return all;
  },
  refreshContext: async () => {
    try {
      const result = await window.llama.getContextUsage();
      set({ context: result.context ?? null });
    } catch {
      // Purely informational - never let it break the chat
    }
  },
}));
