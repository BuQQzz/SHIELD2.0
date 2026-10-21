/**
 * The Team panel's state: every sub-agent's run in each conversation, which
 * one is open, and whether the panel is collapsed. Runs live in memory (a
 * restart forgets them, like the team's notes and hand-offs).
 */

import { create } from "zustand";
import type { AgentEvent } from "@/agents/events";
import {
  appendLiveText,
  applyAgentEvent,
  latestRun,
  type AgentRunView,
} from "@/agents/runView";

const COLLAPSED_KEY = "shield.teamPanel.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

interface TeamState {
  runsByConversation: Record<string, AgentRunView[]>;
  /** Where the current message's runs start, per conversation (its plan covers those) */
  turnStart: Record<string, number>;
  selectedRunId: string | null;
  /** Open the newest working agent on its own, until the user picks one */
  followLatest: boolean;
  collapsed: boolean;

  record: (conversationId: string, event: AgentEvent) => void;
  /** Saved runs of a conversation, put back when it opens (once) */
  hydrate: (conversationId: string, runs: AgentRunView[]) => void;
  /** A new user message: its delegations make a plan of their own */
  beginTurn: (conversationId: string) => void;
  streamToken: (sessionId: string, token: string) => void;
  /** The user opened an agent (or, with null, went back to the list) */
  select: (runId: string | null) => void;
  follow: (conversationId: string) => void;
  setCollapsed: (collapsed: boolean) => void;
  clear: (conversationId: string) => void;
}

export const useTeamStore = create<TeamState>((set) => ({
  runsByConversation: {},
  turnStart: {},
  selectedRunId: null,
  followLatest: true,
  collapsed: readCollapsed(),

  record: (conversationId, event) =>
    set((state) => {
      const runs = applyAgentEvent(
        state.runsByConversation[conversationId] ?? [],
        event
      );
      const next = {
        runsByConversation: {
          ...state.runsByConversation,
          [conversationId]: runs,
        },
      };
      return event.type === "start" && state.followLatest
        ? { ...next, selectedRunId: event.runId }
        : next;
    }),

  hydrate: (conversationId, runs) =>
    set((state) =>
      (state.runsByConversation[conversationId]?.length ?? 0) > 0 ||
      runs.length === 0
        ? state
        : {
            runsByConversation: {
              ...state.runsByConversation,
              [conversationId]: runs,
            },
            // restored runs are not part of the next message's plan
            turnStart: { ...state.turnStart, [conversationId]: runs.length },
          }
    ),

  beginTurn: (conversationId) =>
    set((state) => ({
      turnStart: {
        ...state.turnStart,
        [conversationId]: (state.runsByConversation[conversationId] ?? [])
          .length,
      },
    })),

  streamToken: (sessionId, token) =>
    set((state) => {
      let changed = false;
      const runsByConversation: Record<string, AgentRunView[]> = {};
      for (const [id, runs] of Object.entries(state.runsByConversation)) {
        const updated = appendLiveText(runs, sessionId, token);
        if (updated !== runs) changed = true;
        runsByConversation[id] = updated;
      }
      return changed ? { runsByConversation } : state;
    }),

  select: (runId) => set({ selectedRunId: runId, followLatest: false }),

  follow: (conversationId) =>
    set((state) => ({
      followLatest: true,
      selectedRunId:
        latestRun(state.runsByConversation[conversationId] ?? [])?.id ?? null,
    })),

  setCollapsed: (collapsed) => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // not remembered; the panel still works
    }
    set({ collapsed });
  },

  clear: (conversationId) =>
    set((state) => {
      const { [conversationId]: _gone, ...rest } = state.runsByConversation;
      return {
        runsByConversation: rest,
        selectedRunId: null,
        followLatest: true,
      };
    }),
}));

/** The open agent of a conversation, if it has one */
export function selectedRun(
  runs: AgentRunView[],
  selectedRunId: string | null
): AgentRunView | undefined {
  return runs.find((run) => run.id === selectedRunId);
}
