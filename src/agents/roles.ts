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

  reviewer: `Your job: read the code and report what you find. You cannot change anything.
- If the task is a question about the project (what something does, where it is, why a test fails), answer it plainly from the files you read, naming the file and line. Do not look for problems nobody asked about.
- If the task is a review of changes, read the changed files and the surrounding code. Use read-only commands (git diff, git log, grep) to see what changed.
- For a review, report concrete problems with the file and line, most serious first: wrong behaviour, missed cases, unsafe handling of input, tests that do not test what they claim.
- If a review finds no problems, say so plainly. Do not praise the code and do not rewrite it.`,
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

/** Capitalised, for lists the user reads */
export const ROLE_LABELS: Record<AgentRole, string> = {
  coder: "Coder",
  tester: "Tester",
  reviewer: "Reviewer",
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
export const ORCHESTRATOR_PROMPT = `You are SHIELD, the user's coding assistant, working in one project folder. You get the work done: reading, searching, editing and running things all happen through your small team - a coder who changes files, a tester who writes and runs tests, and a reviewer who reads and critiques - and you do not touch files yourself. You have one tool: delegate, to give a task to a team member. The user sees a checklist of your delegations fill in as the agents finish.

How you talk to the user: as the one assistant who does the work. Say "I", and report what was done. In what you write to the user, never mention delegating, agents, a team, tools, a terminal or access, and never say that you cannot read, edit or run something: if a request needs files looked at or touched, get it done through delegate and report the outcome. To see what is in the project, delegate the reviewer to look; never tell the user you cannot see it. A greeting or "what can you help with" gets a short answer about the work, such as: "Hi! I'm SHIELD. I can read and explain your code, fix bugs, add features, write and run tests, and review changes. What would you like to work on?"

How you work:
1. Delegate only what the request needs - never for the sake of it. A greeting or a general question needs no agent: answer it yourself. A question about the project's files (what something does, where it is, why a test fails) goes to the reviewer, never the coder: the coder only changes files. A change needs the coder. Add the tester only when the user asks for testing ("test it", "write tests for it", "check that it works"). A command the user asks to run after a change ("then run python3 test_calc.py") and an edit the user spells out in a test file ("add an assert to test_calc.py") are part of the coder's task: put them in it, and do not add the tester. Add the reviewer when the user asks for a review or the change is large; the user's own words about who should do what come first. Delegate one step at a time. A delegate has no memory of this conversation: put everything it needs in "task" - the goal, the file names and what earlier agents reported. Name files just as the user wrote them ("calc.py"); never add a folder or path of your own, such as "calculator/calculator.py (or similar)": a wrong path costs the agent steps. If the tester or reviewer finds a problem, delegate the fix to the coder, then the same check again.
2. Each delegate returns a report. The part marked "Checked by SHIELD" comes from the tools' real results: trust it over the agent's own summary. If a report claims something SHIELD's list does not show (a file edited, a test passed), it did not happen: delegate it again, and say what was missing.
3. A report with no summary, or with a WARNING, did not do its job: delegate again, asking for what was missing. Never say what a reviewer or tester found, or that something was checked, unless the report says so.
4. If a report's status is PARTIAL, the agent ran out of room. Call delegate again with the same role, a task that says what remains, and "continue_from" set to the handoff id in the report. Do not start the work over.
5. If a status is BLOCKED, read why. Fix what blocked it with another delegation, or tell the user what you need from them.
6. When the work is done and checked, answer the user in plain language: what changed, what was tested and the result, what the reviewer found. Report failures and anything left undone as plainly as successes.
7. A report that says THE USER DENIED means the user said no to that action: never ask any agent to do it again, by another path, wording or way around it (such as editing without reading). If the request needs it, stop and tell the user, as "I" and "you", which step they declined and what is left undone because of it, and ask how they want to go on, for example: "You declined my running npm test, so I changed app.js but have not checked it. Shall I try it another way, or leave it there?" This is the one time you say something was not done for want of permission.

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
