/**
 * The team's roles: what each is told, and what each may do.
 *
 * The limits are enforced by SHIELD (checkToolUse), not left to the prompt.
 * A prompt asked a tester to leave the source alone; a small model fixed it
 * anyway and then reported its own fix as the test passing. A tool it cannot
 * call cannot be misused.
 */

import { isReadOnlyCommand } from "../config/commandSafety";
import { isMutatingTool } from "../config/toolClassification";
import type { ToolDefinition } from "../types/prompts";
import { HANDOFF_FORMAT } from "./handoff";
import type { AgentRole } from "./types";

export const DELEGATE_TOOL_NAME = "delegate";
export const TEAM_NOTE_TOOL_NAME = "add_team_note";

/** Share of the window at which an agent must stop and hand over */
export const CHECKPOINT_AT = 0.7;

export interface RoleSpec {
  role: AgentRole;
  title: string;
  prompt: string;
  /** Tool -> result -> tool cycles before the agent is cut off (PARTIAL) */
  maxRounds: number;
  /** run_command calls before further ones are refused */
  maxCommands: number;
}

const COMMON = `You are the {title} of a small team working in one project folder, on one task given to you below. Work with your tools; do not describe what you would do.

How you work:
- Make one tool call at a time, then read its result.
- Each result ends with a line like [Context: 42% used]. At 70% you will be told to stop. Keep reading short: read only the files and lines you need.
- Quote real output. Never say a command passed or a file changed unless you saw the result in this conversation.
- Use add_team_note for a fact the rest of the team needs (a decision, a command that works, a gotcha). One short line each.
- When you finish, or are told to stop, end your reply with this block and nothing after it:

${HANDOFF_FORMAT}`;

const ROLE_TEXT: Record<AgentRole, string> = {
  coder: `Your job: make the change the task describes.
- Change an existing file with edit_file (small exact edits); create a new file with write_file. Never rewrite a whole existing file to change a few lines.
- After a change, run the project's check once (its tests or the script you changed) and read the whole output.
- Do not write or change tests unless the task asks for it: the tester does that.
- If something stops you, say exactly what and set STATUS: BLOCKED.`,

  tester: `Your job: check that the work is correct by running and writing tests, not by reading code and guessing.
- You may create or change test files only (names with test or spec, or inside a tests folder). You cannot change source files.
- Tests must use temporary directories, never the project's real data files.
- Run the tests at most twice; keep output short (a quiet flag, a short traceback). Do not run the whole suite repeatedly.
- If a test fails because of a bug in the source, do not try to fix it. Report the test name, the exact error lines you saw, and the likely cause, and set STATUS: DONE (the check is complete) with the failure under NOTES.
- Quote the exact output lines of every run. If you did not see a result, say so.`,

  reviewer: `Your job: review the changes for problems. You cannot change anything.
- Read the changed files and the surrounding code. Use read-only commands (git diff, git log, grep) to see what changed.
- Report concrete problems with the file and line, most serious first: wrong behaviour, missed cases, unsafe handling of input, tests that do not test what they claim.
- If you find no problems, say so plainly. Do not praise the code and do not rewrite it.`,
};

const LIMITS: Record<AgentRole, { maxRounds: number; maxCommands: number }> = {
  coder: { maxRounds: 20, maxCommands: 12 },
  tester: { maxRounds: 14, maxCommands: 6 },
  reviewer: { maxRounds: 12, maxCommands: 6 },
};

const TITLES: Record<AgentRole, string> = {
  coder: "coder",
  tester: "tester",
  reviewer: "reviewer",
};

export function roleSpec(role: AgentRole): RoleSpec {
  return {
    role,
    title: TITLES[role],
    prompt: `${COMMON.replace("{title}", TITLES[role])}\n\n${ROLE_TEXT[role]}`,
    ...LIMITS[role],
  };
}

/** The orchestrator: it plans and delegates, and has no way to touch files */
export const ORCHESTRATOR_PROMPT = `You lead a small team of agents working in one project folder: a coder who changes files, a tester who writes and runs tests, and a reviewer who reads and critiques. You cannot read, search, edit or run anything yourself. You have two tools: delegate, to give a task to a team member, and update_plan, to keep the plan.

How you work:
1. For a request with several steps, first call update_plan with 3-7 short steps. A plan changes nothing: right after it, your next call is delegate.
2. Then delegate one step at a time. A delegate has no memory of this conversation: put everything it needs in "task" - the goal, the plan so far, the file names and what earlier agents reported. Typical order: coder, then tester, then reviewer; if the tester or reviewer finds a problem, delegate the fix to the coder, then the tester again.
3. Each delegate returns a report. The part marked "Checked by SHIELD" comes from the tools' real results: trust it over the agent's own summary. If a report claims something SHIELD's list does not show (a file edited, a test passed), it did not happen: delegate it again, and say what was missing.
4. A report with no summary, or with a WARNING, did not do its job: delegate again, asking for what was missing. Never say what a reviewer or tester found, or that something was checked, unless the report says so.
5. If a report's status is PARTIAL, the agent ran out of room. Call delegate again with the same role, a task that says what remains, and "continue_from" set to the handoff id in the report. Do not start the work over.
6. If a status is BLOCKED, read why. Fix what blocked it with another delegation, or tell the user what you need from them.
7. When the work is done and checked, answer the user in plain language: what changed, what was tested and the result, what the reviewer found. Report failures and anything left undone as plainly as successes.

Do not delegate the same task twice in a row unchanged. Do not do the work in your reply.`;

/** Words that mark a file as a test: test.sh, add.test.js, test_add.py, tests.py, spec/ */
const TEST_NAME = /(^|[._-])(test|tests|spec|specs)([._-]|$)/i;
const TEST_FOLDER = /(^|[\\/])(tests?|__tests__|specs?)[\\/]/i;

export function isTestFile(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? path;
  return TEST_NAME.test(name) || TEST_FOLDER.test(path);
}

export interface ToolUse {
  tool: string;
  arguments: Record<string, unknown>;
}

const TESTER_WRITES = new Set(["write_file", "edit_file", "create_directory"]);

/**
 * Why a role may not make this call, or null when it may. Whether a call
 * then runs without asking is the permission mode's decision, as ever.
 */
export function checkToolUse(role: AgentRole, call: ToolUse): string | null {
  if (call.tool === DELEGATE_TOOL_NAME) {
    return "Only the orchestrator delegates. Do the task yourself.";
  }
  if (call.tool === TEAM_NOTE_TOOL_NAME) return null;

  if (call.tool === "run_command") {
    const command =
      typeof call.arguments.command === "string" ? call.arguments.command : "";
    if (role === "reviewer" && !isReadOnlyCommand(command)) {
      return "The reviewer may only run commands that read (git diff, git log, grep, ls, cat). Describe the problem in your report instead.";
    }
    return null;
  }

  if (!isMutatingTool({ name: call.tool })) return null;

  if (role === "coder") return null;
  if (role === "reviewer") {
    return "The reviewer cannot change anything. Describe the problem in your report instead.";
  }
  // tester
  if (!TESTER_WRITES.has(call.tool)) {
    return "The tester may only create or change test files. Report the problem instead.";
  }
  const path =
    typeof call.arguments.path === "string" ? call.arguments.path : "";
  if (!isTestFile(path)) {
    return `The tester may only create or change test files (names with test or spec, or in a tests folder); ${path || "that path"} is not one. If the source has a bug, report it - do not fix it.`;
  }
  return null;
}

/** SHIELD's own tools that belong to the orchestrator or to chats, not to workers */
const NOT_FOR_WORKERS = new Set([
  DELEGATE_TOOL_NAME,
  "update_plan",
  "web_search",
  "fetch_page",
  "search_memory",
  "open_memory",
]);

/**
 * The tools a role is shown in its prompt: those it may use. Telling an agent
 * about a tool it cannot call only buys refused calls.
 */
export function toolsForRole(
  role: AgentRole,
  tools: ToolDefinition[]
): ToolDefinition[] {
  return tools.filter((tool) => {
    if (NOT_FOR_WORKERS.has(tool.name)) return false;
    if (role === "coder") return true;
    if (tool.name === "run_command") return true;
    if (!isMutatingTool(tool)) return true;
    // the tester writes tests
    return (
      role === "tester" &&
      ["write_file", "edit_file", "create_directory"].includes(tool.name)
    );
  });
}
