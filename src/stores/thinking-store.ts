/**
 * The thinking level the user picked for each model (config/thinking.ts),
 * remembered on this computer. Default until they pick one.
 */

import { create } from "zustand";
import { isThinkingLevel, type ThinkingLevel } from "@/config/thinking";

const KEY = "shield.thinkingLevels";

function read(): Record<string, ThinkingLevel> {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      unknown
    >;
    return Object.fromEntries(
      Object.entries(saved).filter((entry): entry is [string, ThinkingLevel] =>
        isThinkingLevel(entry[1])
      )
    );
  } catch {
    return {};
  }
}

interface ThinkingState {
  levels: Record<string, ThinkingLevel>;
  set: (modelId: string, level: ThinkingLevel) => void;
}

export const useThinkingStore = create<ThinkingState>((set) => ({
  levels: read(),
  set: (modelId, level) =>
    set((state) => {
      const levels = { ...state.levels };
      if (level === "default") delete levels[modelId];
      else levels[modelId] = level;
      try {
        localStorage.setItem(KEY, JSON.stringify(levels));
      } catch {
        // Not remembered; it still applies until SHIELD restarts
      }
      return { levels };
    }),
}));

/** The level for a model: what the user picked, else Default */
export const levelFor = (
  levels: Record<string, ThinkingLevel>,
  modelId: string | undefined
): ThinkingLevel => (modelId ? (levels[modelId] ?? "default") : "default");
