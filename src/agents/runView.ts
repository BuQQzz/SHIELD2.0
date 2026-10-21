/**
 * What the Team panel shows of one agent's run, built from its events.
 * Pure (events in, views out) so it is tested without React.
 */

import type { AgentEvent } from "./events";
import type { AgentRole, AgentStatus } from "./types";

export type RunStep =
  | { kind: "say"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      tool: string;
      /** The file, folder or command it acts on */
      target?: string;
      state: "running" | "ok" | "failed" | "refused";
      /** The start of its output, or why it was refused */
      text?: string;
    };

export interface AgentRunView {
  id: string;
  role: AgentRole;
  task: string;
  continuesFrom?: string;
  status: "running" | AgentStatus;
  steps: RunStep[];
  /** Text the model is writing right now; replaced by a "say" step when the reply ends */
  live: string;
  sessionId?: string;
  contextPercent: number;
  /** The agent was told to stop and hand over */
  checkpointed: boolean;
  summary?: string;
  reason?: string;
  /** SHIELD's record of what the agent did */
  workLines: string[];
  startedAt: number;
  endedAt?: number;
}

const update = (
  runs: AgentRunView[],
  runId: string,
  change: (run: AgentRunView) => AgentRunView
): AgentRunView[] => runs.map((run) => (run.id === runId ? change(run) : run));

export function applyAgentEvent(
  runs: AgentRunView[],
  event: AgentEvent,
  now = Date.now()
): AgentRunView[] {
  switch (event.type) {
    case "start":
      // A run id is never reused, but a replayed start must not duplicate it
      if (runs.some((run) => run.id === event.runId)) return runs;
      return [
        ...runs,
        {
          id: event.runId,
          role: event.role,
          task: event.task,
          continuesFrom: event.continuesFrom,
          status: "running",
          steps: [],
          live: "",
          contextPercent: 0,
          checkpointed: false,
          workLines: [],
          startedAt: now,
        },
      ];
    case "session":
      return update(runs, event.runId, (run) => ({
        ...run,
        sessionId: event.sessionId,
      }));
    case "reply":
      return update(runs, event.runId, (run) => ({
        ...run,
        live: "",
        steps: [
          ...run.steps,
          {
            kind: "say",
            id: `${run.id}-say-${run.steps.length}`,
            text: event.text,
          },
        ],
      }));
    case "tool":
      return update(runs, event.runId, (run) => ({
        ...run,
        live: "",
        steps: [
          ...run.steps,
          {
            kind: "tool",
            id: event.callId,
            tool: event.tool,
            target: event.target,
            state: "running",
          },
        ],
      }));
    case "result":
      return update(runs, event.runId, (run) => ({
        ...run,
        steps: run.steps.map((step) =>
          step.kind === "tool" && step.id === event.callId
            ? {
                ...step,
                state: event.refused ? "refused" : event.ok ? "ok" : "failed",
                text: event.text,
              }
            : step
        ),
      }));
    case "context":
      return update(runs, event.runId, (run) => ({
        ...run,
        contextPercent: event.percent,
      }));
    case "checkpoint":
      return update(runs, event.runId, (run) => ({
        ...run,
        checkpointed: true,
        contextPercent: event.percent,
      }));
    case "end":
      return update(runs, event.runId, (run) => ({
        ...run,
        status: event.status,
        live: "",
        summary: event.summary,
        reason: event.reason,
        workLines: event.workLines,
        contextPercent: event.contextPercent || run.contextPercent,
        endedAt: now,
        // a tool that never got its result (a crash) is not still running
        steps: run.steps.map((step) =>
          step.kind === "tool" && step.state === "running"
            ? { ...step, state: "failed" as const }
            : step
        ),
      }));
  }
}

/** Streamed text from the model session of a running agent */
export function appendLiveText(
  runs: AgentRunView[],
  sessionId: string,
  token: string
): AgentRunView[] {
  if (
    !runs.some((run) => run.sessionId === sessionId && run.status === "running")
  ) {
    return runs;
  }
  return runs.map((run) =>
    run.sessionId === sessionId && run.status === "running"
      ? { ...run, live: run.live + token }
      : run
  );
}

/** Runs kept with a conversation: the latest this many */
export const MAX_SAVED_RUNS = 24;

/**
 * Saved runs, as the panel shows them after SHIELD restarts. A run that was
 * still working when it was saved never finished (SHIELD closed, or crashed):
 * it is shown handed over, with why. Live text and session ids belong to a
 * model session that is gone.
 */
export function restoreRuns(saved: AgentRunView[]): AgentRunView[] {
  return saved.slice(-MAX_SAVED_RUNS).map((run) => {
    const { sessionId: _session, ...rest } = run;
    void _session;
    const interrupted = run.status === "running";
    return {
      ...rest,
      live: "",
      status: interrupted ? "PARTIAL" : run.status,
      reason: interrupted
        ? "SHIELD was closed while it was working"
        : run.reason,
      endedAt: run.endedAt ?? (interrupted ? run.startedAt : undefined),
      steps: run.steps.map((step) =>
        step.kind === "tool" && step.state === "running"
          ? { ...step, state: "failed" as const }
          : step
      ),
    };
  });
}

/** The run to follow: the newest still working, else the newest */
export function latestRun(runs: AgentRunView[]): AgentRunView | undefined {
  return (
    [...runs].reverse().find((run) => run.status === "running") ?? runs.at(-1)
  );
}
