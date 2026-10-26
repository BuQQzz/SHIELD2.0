/**
 * What a sub-agent's run reports as it goes, so the app can show the agent
 * working (the Team panel). The runner emits these; it knows nothing about
 * who listens.
 */

import type { AgentRole, AgentStatus } from "./types";

export type AgentEvent =
  | {
      type: "start";
      runId: string;
      role: AgentRole;
      task: string;
      /** The hand-off this run continues, when it does */
      continuesFrom?: string;
    }
  /** The model session this run talks to, to route its streamed text */
  | { type: "session"; runId: string; sessionId: string }
  /** One finished model reply, without its tool-call markup */
  | { type: "reply"; runId: string; text: string }
  | {
      type: "tool";
      runId: string;
      callId: string;
      tool: string;
      /** The file, folder or command it acts on */
      target?: string;
    }
  | {
      type: "result";
      runId: string;
      callId: string;
      ok: boolean;
      /** SHIELD did not run it (a role limit, the command cap, a checkpoint) */
      refused: boolean;
      /** The start of the tool's output, or why it was refused */
      text: string;
    }
  | { type: "context"; runId: string; percent: number }
  | { type: "checkpoint"; runId: string; percent: number }
  | {
      type: "end";
      runId: string;
      status: AgentStatus;
      summary: string;
      reason?: string;
      /** SHIELD's own record, one line each (files, commands, refusals) */
      workLines: string[];
      steps: number;
      contextPercent: number;
    };

export type AgentEventSink = (event: AgentEvent) => void;
