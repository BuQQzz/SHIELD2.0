/** Shared shapes of the agent team (see roles.ts, agentRunner.ts) */

export const AGENT_ROLES = ["coder", "tester", "reviewer"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

/**
 * How a sub-agent's run ended:
 * - DONE: the task is finished
 * - PARTIAL: it stopped with work left (context at the checkpoint, or the
 *   step limit); a fresh agent can continue from its hand-off
 * - BLOCKED: it cannot go on without something it does not have
 * - FAILED: the run itself broke (the model session, not the task)
 */
export type AgentStatus = "DONE" | "PARTIAL" | "BLOCKED" | "FAILED";

/** What SHIELD saw an agent change, from the tools' own results */
export interface VerifiedFile {
  path: string;
  action: "written" | "edited" | "moved" | "deleted" | "directory";
  ok: boolean;
  /** Checks already in a test file that an edit changed or took out */
  changedChecks?: number;
}

export interface VerifiedCommand {
  command: string;
  /** null when the command was stopped or did not start */
  exitCode: number | null;
  /** Lines of output that looked like failures after an exit code of 0 */
  suspectLines: number;
}

export interface VerifiedWork {
  files: VerifiedFile[];
  commands: VerifiedCommand[];
  /** Calls SHIELD did not run, with why ("tester may only change test files") */
  refused: string[];
}

/** The part of a hand-off the agent itself writes */
export interface ParsedHandoff {
  found: boolean;
  status?: Exclude<AgentStatus, "FAILED">;
  done: string;
  inProgress: string;
  next: string;
  notes: string;
}

/** A hand-off kept by the team, so a PARTIAL run can be continued */
export interface StoredHandoff {
  id: string;
  role: AgentRole;
  task: string;
  status: AgentStatus;
  /**
   * False for the placeholder kept while a run is going (or after it broke);
   * true once the run ended and wrote this hand-off
   */
  finished?: boolean;
  parsed: ParsedHandoff;
  work: VerifiedWork;
}

/** What a delegation returns to the orchestrator */
export interface AgentReport {
  role: AgentRole;
  status: AgentStatus;
  handoffId: string;
  /** The agent's last reply, without its HANDOFF block */
  summary: string;
  parsed: ParsedHandoff;
  work: VerifiedWork;
  /** Tool calls the agent made (run or refused) */
  steps: number;
  /** Share of the window used when it stopped, 0-100 */
  contextPercent: number;
  /** Why a PARTIAL, BLOCKED or FAILED run ended */
  reason?: string;
  /** What the user sent while it worked, which it was given */
  steered?: string[];
}
