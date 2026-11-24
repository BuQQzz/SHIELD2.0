/**
 * Turn ask: a running turn pauses for the user's yes or no
 *
 * Three cases, all for hosted models, where SHIELD asks rather than ends
 * the work (opencode's doom_loop asks too, research 2026-11-23):
 * - repeat: the model sent the same call a third time in this turn
 *   (runRules.ts askOnRepeat). Polling a server until it is up, or
 *   running the tests again after a change elsewhere, can be meant.
 * - spend: the task has cost more than the user's spend limit.
 * - idle: the model has made many tool calls without changing a file.
 *   At a 48K window DeepSeek V4.1 Flash went 345 and 543 calls reading
 *   the same files over and over (their copies kept being cleared for
 *   room); finished runs went at most 27 (2026-11-23). A note telling it
 *   so changed nothing: the user decides.
 *
 * The tool loop waits on ask(); TurnAskBar shows it; Stop answers no.
 */

import { create } from "zustand";
import { useGenerationStore } from "./generationStore";

export interface TurnAsk {
  kind: "repeat" | "spend" | "idle";
  /** What the bar says, after its lead-in */
  text: string;
}

interface TurnAskStore {
  pending: TurnAsk | null;
  resolve: ((allow: boolean) => void) | null;
  /** Resolves true to go on, false to stop the turn */
  ask: (question: TurnAsk) => Promise<boolean>;
  answer: (allow: boolean) => void;
}

export const useTurnAskStore = create<TurnAskStore>((set, get) => ({
  pending: null,
  resolve: null,
  ask: (question) => {
    get().resolve?.(false);
    if (useGenerationStore.getState().stopRequested) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      const unsubscribe = useGenerationStore.subscribe((state) => {
        if (state.stopRequested) get().answer(false);
      });
      set({
        pending: question,
        resolve: (allow) => {
          unsubscribe();
          resolve(allow);
        },
      });
    });
  },
  answer: (allow) => {
    const { resolve } = get();
    set({ pending: null, resolve: null });
    resolve?.(allow);
  },
}));

/** The repeat ask, as the tool loop's confirmRepeat */
export const askRepeat = (call: string) =>
  useTurnAskStore.getState().ask({ kind: "repeat", text: call });

/** Tool calls without a file change before the idle ask, and between asks */
export const IDLE_CALLS = 60;

/**
 * The idle check for one turn: asks once the model has made IDLE_CALLS
 * calls since it last changed a file, and again IDLE_CALLS later if
 * allowed. True to go on.
 */
export function idleCheck(): (callsSinceChange: number) => Promise<boolean> {
  let askAt = IDLE_CALLS;
  return async (calls) => {
    if (calls < IDLE_CALLS) askAt = IDLE_CALLS;
    if (calls < askAt) return true;
    const allow = await useTurnAskStore.getState().ask({
      kind: "idle",
      text: `${calls} tool calls without changing a file`,
    });
    if (allow) askAt = calls + IDLE_CALLS;
    return allow;
  };
}

/** US dollars, as the bar shows them */
export const dollars = (value: number) =>
  `$${value < 10 ? value.toFixed(2) : value.toFixed(0)}`;

/**
 * The spend check for one turn: asks once the turn's cost reaches the
 * limit, and again each time it grows by another limit's worth. True to
 * go on. No limit (0 or unset): never asks.
 */
export function spendCheck(
  limit: number | undefined,
  spent: () => number
): () => Promise<boolean> {
  let askAt = limit && limit > 0 ? limit : Infinity;
  return async () => {
    const cost = spent();
    if (cost < askAt) return true;
    const allow = await useTurnAskStore.getState().ask({
      kind: "spend",
      text: `${dollars(cost)} so far, past your limit of ${dollars(limit!)}`,
    });
    if (allow) askAt = cost + limit!;
    return allow;
  };
}
