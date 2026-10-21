/**
 * Catches an orchestrator's answer that credits work to an agent it never
 * ran. Live (2026-10-20) it wrote "The tester ran python3 test_calc.py and
 * confirmed..." after delegating only to a coder and a reviewer; the test
 * had passed (the coder ran it), but no tester existed. A note under the
 * reply, from SHIELD's record of the delegations, says so.
 */

import type { AgentRole } from "./types";

/** "the tester ran", "the reviewer confirmed": a role doing something */
const CLAIMS: Record<AgentRole, RegExp> = {
  coder:
    /\b(?:the |a )?coder\s+(?:fixed|changed|wrote|updated|implemented|edited|made|replaced|corrected|added)\b/i,
  tester:
    /\b(?:the |a )?tester\s+(?:ran|run|confirmed|verified|checked|wrote|tested|found|reported|executed|validated)\b/i,
  reviewer:
    /\b(?:the |a )?reviewer\s+(?:reviewed|confirmed|found|noted|checked|approved|reported|critiqued|flagged|verified)\b/i,
};

/** A note for the user, or "" when every role the answer credits did run */
export function unbackedRoleNote(
  answer: string,
  runs: { role: AgentRole }[]
): string {
  const ran = new Set(runs.map((run) => run.role));
  const missing = (Object.keys(CLAIMS) as AgentRole[]).filter(
    (role) => CLAIMS[role].test(answer) && !ran.has(role)
  );
  if (missing.length === 0) return "";
  const names = missing.map((role) => `no ${role}`).join(" or ");
  return `SHIELD's record: ${names} was delegated for this request, so what the answer says ${missing.length === 1 ? "that agent" : "those agents"} did was not done by one.`;
}
