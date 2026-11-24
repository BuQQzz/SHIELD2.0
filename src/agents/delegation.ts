/**
 * What happens when the orchestrator calls delegate: check the arguments,
 * find the hand-off to continue from, run the agent, and answer with its
 * report. Pure of React and Electron, so it is tested alone.
 */

import { TEAM_LIMITS } from "../handlers/runRules";
import type { MCPToolResult } from "../types/electron";
import { runAgent, type AgentRunDeps } from "./agentRunner";
import {
  formatReport,
  MAX_DELEGATIONS_PER_TURN,
  parseDelegateArgs,
} from "./delegate";
import type { TeamRun } from "./team";

const reportResult = (text: string, changed: boolean): MCPToolResult => ({
  success: true,
  data: { content: [{ type: "text", text }] },
  changed,
});

export async function handleDelegate(
  args: Record<string, unknown>,
  team: TeamRun,
  deps: AgentRunDeps
): Promise<MCPToolResult> {
  const parsed = parseDelegateArgs(args);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const { role, task, title, continueFrom } = parsed.value;

  let earlier;
  let attached = false;
  if (!continueFrom) {
    // A PARTIAL run of this role that nothing continued: hand it over
    earlier = team.openPartialFor(role);
    attached = earlier !== undefined;
  }
  if (continueFrom) {
    earlier = team.getHandoff(continueFrom);
    if (!earlier) {
      return {
        success: false,
        error: `There is no handoff "${continueFrom}" to continue from. Use the id from a PARTIAL report, or leave continue_from out to start fresh. Nothing was delegated.`,
      };
    }
  }

  const most =
    team.profile === "cloud"
      ? TEAM_LIMITS.cloud.delegations
      : MAX_DELEGATIONS_PER_TURN;
  if (!team.countDelegation(most)) {
    return {
      success: false,
      error: `You have delegated ${most} times for this request, the most allowed. Stop delegating and tell the user where things stand: what is done, what was checked, and what is left.`,
    };
  }

  // Taken before the run: another agent started alongside it (parallel.ts)
  // must not pick up the same hand-off
  if (earlier) team.markContinued(earlier.id);
  const report = await runAgent(
    { role, task, title, continueFrom: earlier, team },
    deps
  );
  if (attached && earlier && report.status !== "FAILED") {
    report.reason = [
      report.reason,
      `SHIELD gave it the hand-off of the earlier ${role} run ${earlier.id}, which ended PARTIAL`,
    ]
      .filter(Boolean)
      .join("; ");
  }
  if (report.status === "FAILED") {
    return {
      success: false,
      error: `The ${role} could not run: ${report.reason ?? "unknown error"}. Tell the user; do not do its work yourself.`,
    };
  }
  // A command may have changed files too
  const changed =
    report.work.files.some((file) => file.ok) ||
    report.work.commands.length > 0;
  return reportResult(formatReport(report), changed);
}
