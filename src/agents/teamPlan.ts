/**
 * The plan checklist of a Team session, built from the delegations rather
 * than written by the orchestrator.
 *
 * The orchestrator used to keep it with update_plan, and a small model took
 * saving the plan for progress: in five live runs it called update_plan five
 * to nine times in a row, never delegating again, until the repeat guard
 * stopped it. Its plan also drifted from what happened (a finished review left
 * unticked). Built from the runs, each step is one delegation and is ticked by
 * that agent's actual result.
 */

import type { PlanStep } from "../config/plan";
import { MAX_STEP_CHARS, MAX_STEPS } from "../config/plan";
import type { AgentRunView } from "./runView";
import { ROLE_LABELS } from "./roles";

/** An absolute path as its last two segments: "/home/me/app/src/a.js" is "src/a.js" */
const shortenPaths = (text: string) =>
  text.replace(
    /[A-Za-z]:[\\/](?:[^\s'"\\/]+[\\/])+([^\s'"\\/]+)|(?:\/[^\s'"/]+){3,}/g,
    (path) => path.split(/[\\/]/).filter(Boolean).slice(-2).join("/")
  );

/** The task's first sentence, short enough for a checklist line */
export function stepTask(task: string): string {
  const line = shortenPaths(task.replace(/\s+/g, " ").trim());
  const sentence = /^(.+?[.!?])(\s|$)/.exec(line)?.[1] ?? line;
  return sentence.length > 90
    ? `${sentence.slice(0, 87).trimEnd()}...`
    : sentence;
}

/**
 * One step per delegation: working = in progress, DONE = completed. A run
 * that ended PARTIAL, BLOCKED or FAILED is not finished, so it is pending
 * (the orchestrator then delegates it again as a new step).
 */
export function planStepsFromRuns(runs: AgentRunView[]): PlanStep[] {
  return runs.slice(-MAX_STEPS).map((run) => ({
    step: `${ROLE_LABELS[run.role]}: ${stepTask(run.task)}`.slice(
      0,
      MAX_STEP_CHARS
    ),
    status:
      run.status === "running"
        ? "in_progress"
        : run.status === "DONE"
          ? "completed"
          : "pending",
  }));
}
