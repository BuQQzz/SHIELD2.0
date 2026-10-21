/**
 * What happens when the orchestrator calls delegate: check the arguments,
 * find the hand-off to continue from, run the agent, and answer with its
 * report. Pure of React and Electron, so it is tested alone.
 */

import type { MCPToolResult } from "../types/electron";
import { runAgent, type AgentRunDeps } from "./agentRunner";
import {
  formatReport,
  MAX_DELEGATIONS_PER_TURN,
  parseDelegateArgs,
} from "./delegate";
import type { TeamRun } from "./team";

const reportResult = (text: string): MCPToolResult => ({
  success: true,
  data: { content: [{ type: "text", text }] },
});

export async function handleDelegate(
  args: Record<string, unknown>,
  team: TeamRun,
  deps: AgentRunDeps
): Promise<MCPToolResult> {
  const parsed = parseDelegateArgs(args);
  if (!parsed.ok) return { success: false, error: parsed.error };
  const { role, task, continueFrom } = parsed.value;

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

  if (!team.countDelegation(MAX_DELEGATIONS_PER_TURN)) {
    return {
      success: false,
      error: `You have delegated ${MAX_DELEGATIONS_PER_TURN} times for this request, the most allowed. Stop delegating and tell the user where things stand: what is done, what was checked, and what is left.`,
    };
  }

  const report = await runAgent(
    { role, task, continueFrom: earlier, team },
    deps
  );
  if (earlier) team.markContinued(earlier.id);
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
  return reportResult(formatReport(report));
}
