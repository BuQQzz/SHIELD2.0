/**
 * The orchestrator's tool: delegate a task to a team member.
 *
 * Arguments are validated strictly. A small model fills optional fields with
 * junk (`task_id: "1"`) and invents values for what it was not given, so
 * unknown fields are dropped and a bad `continue_from` is refused with what a
 * good one looks like, instead of being passed on.
 */

import { describeWork } from "./handoff";
import { AGENT_ROLES, type AgentReport, type AgentRole } from "./types";
import { DELEGATE_TOOL_NAME, TEAM_NOTE_TOOL_NAME } from "./roles";

export const AGENTS_SERVER_NAME = "agents";
export const MAX_TASK_CHARS = 6000;
/**
 * Tool rounds the orchestrator gets per message. Each round can be minutes
 * (a delegation runs a whole agent), so a stuck orchestrator on the general
 * limit of 20 ran for a very long time. A plan plus a few delegations fits.
 */
export const MAX_ORCHESTRATOR_ROUNDS = 12;

export const orchestratorRounds = (configured?: number) =>
  Math.min(configured ?? MAX_ORCHESTRATOR_ROUNDS, MAX_ORCHESTRATOR_ROUNDS);

/** Delegations in one user turn: a loop of re-delegating stops here */
export const MAX_DELEGATIONS_PER_TURN = 12;

export const DELEGATE_TOOL = {
  name: DELEGATE_TOOL_NAME,
  description:
    "Give a task to a team member and get its report. Roles: coder (changes files), tester (writes and runs tests; may only change test files), reviewer (reads the code, answers questions about it and critiques it; changes nothing). The agent has no memory of this conversation, so put everything it needs in task: the goal, the plan so far, file names, what earlier agents reported. It runs until it finishes or runs out of room, then reports. For a PARTIAL report, delegate again with continue_from set to its handoff id.",
  inputSchema: {
    type: "object",
    properties: {
      role: { type: "string", enum: [...AGENT_ROLES] },
      task: {
        type: "string",
        description: "What to do, with all the context it needs",
      },
      continue_from: {
        type: "string",
        description:
          'Only to continue a PARTIAL report: its handoff id, like "h2"',
      },
    },
    required: ["role", "task"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

/** What sub-agents may call besides the project's tools; answered by the runner */
export const TEAM_NOTE_TOOL = {
  name: TEAM_NOTE_TOOL_NAME,
  serverName: AGENTS_SERVER_NAME,
  description:
    "Leave a one-line note the whole team sees: a decision, a command that works, a gotcha. Changes nothing on the computer.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", description: "One short line" } },
    required: ["text"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

export function isDelegateTool(name: string): boolean {
  return name === DELEGATE_TOOL_NAME;
}

export interface DelegateArgs {
  role: AgentRole;
  task: string;
  continueFrom?: string;
}

const ROLE_ALIASES: Record<string, AgentRole> = {
  coder: "coder",
  developer: "coder",
  engineer: "coder",
  implementer: "coder",
  programmer: "coder",
  tester: "tester",
  test: "tester",
  qa: "tester",
  reviewer: "reviewer",
  review: "reviewer",
  critic: "reviewer",
};

const first = (args: Record<string, unknown>, keys: string[]) =>
  keys.map((key) => args[key]).find((value) => value !== undefined);

export function parseDelegateArgs(
  args: Record<string, unknown>
): { ok: true; value: DelegateArgs } | { ok: false; error: string } {
  const roleText = first(args, ["role", "agent"]);
  const role =
    typeof roleText === "string"
      ? ROLE_ALIASES[roleText.trim().toLowerCase()]
      : undefined;
  if (!role) {
    return {
      ok: false,
      error: `delegate needs "role": one of ${AGENT_ROLES.join(", ")}. Nothing was delegated.`,
    };
  }

  const taskText = first(args, [
    "task",
    "prompt",
    "instructions",
    "description",
  ]);
  const task = typeof taskText === "string" ? taskText.trim() : "";
  if (!task) {
    return {
      ok: false,
      error:
        'delegate needs "task": what the agent should do, with everything it needs to know (it cannot see this conversation). Nothing was delegated.',
    };
  }
  if (task.length > MAX_TASK_CHARS) {
    return {
      ok: false,
      error: `The task is ${task.length.toLocaleString("en-US")} characters; the limit is ${MAX_TASK_CHARS.toLocaleString("en-US")}. Keep the essentials: the goal, the file names, what remains. Nothing was delegated.`,
    };
  }

  const fromText = first(args, ["continue_from", "continueFrom"]);
  let continueFrom: string | undefined;
  if (fromText !== undefined && fromText !== null && fromText !== "") {
    const id =
      typeof fromText === "string" ? fromText.trim().toLowerCase() : "";
    if (!/^h\d+$/.test(id)) {
      return {
        ok: false,
        error: `continue_from must be a handoff id from a PARTIAL report, like "h2" - not ${JSON.stringify(fromText)}. Leave it out to start fresh. Nothing was delegated.`,
      };
    }
    continueFrom = id;
  }

  return { ok: true, value: { role, task, continueFrom } };
}

const SUMMARY_CHARS = 1500;

/** The report as the orchestrator reads it */
export function formatReport(report: AgentReport): string {
  const head = `[${report.role} · ${report.status} · ${report.steps} step${report.steps === 1 ? "" : "s"} · context ${report.contextPercent}%] handoff ${report.handoffId}`;
  const summary =
    report.summary.length > SUMMARY_CHARS
      ? `${report.summary.slice(0, SUMMARY_CHARS)}... [cut]`
      : report.summary || "(no summary)";
  const { parsed } = report;
  const narrative = [
    parsed.done && `DONE: ${parsed.done}`,
    parsed.inProgress && `IN PROGRESS: ${parsed.inProgress}`,
    parsed.next && `NEXT: ${parsed.next}`,
    parsed.notes && `NOTES: ${parsed.notes}`,
  ].filter((line): line is string => !!line);

  return [
    head,
    report.reason
      ? `${report.status === "DONE" ? "NOTE" : "WHY IT STOPPED"}: ${report.reason}`
      : "",
    report.summary
      ? ""
      : "WARNING: the agent reported nothing. Do not assume it found or checked anything - delegate again if the result matters.",
    `AGENT'S SUMMARY: ${summary}`,
    ...narrative,
    "Checked by SHIELD from the tools' real results (trust this over the summary):",
    ...describeWork(report.work),
    report.status === "PARTIAL"
      ? `This run is not finished. To continue it, delegate to ${report.role} again with continue_from "${report.handoffId}".`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
