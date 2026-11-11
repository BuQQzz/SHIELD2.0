/**
 * Run reminder: before a turn ends, a code file the model changed and
 * nothing has run since.
 *
 * g28 step 17 ("what else would make this better? go ahead and add it")
 * Bonsai 2 added CSV import and answered without running it; at step 20
 * ("is everything still working?") it found the import broken (no
 * `import os`, ids compared as strings) and ran out of time fixing it
 * (2026-11-11). Checking at the end of the turn that made the change costs
 * one round; finding it later cost a step.
 *
 * Measured on Bonsai 2 27B and set per model (ModelMetadata.remindToRun):
 * another model may test on its own, or need a different nudge.
 */

import { CODE_FILE } from "../utils/codeOutline";

const EDIT_TOOLS = new Set(["write_file", "edit_file", "append_file"]);

/** The file name a successful write or edit of code changed, or null */
export function changedCodeFile(
  tool: string,
  args: Record<string, unknown>,
  success: boolean
): string | null {
  const path = args.path;
  if (!success || !EDIT_TOOLS.has(tool) || typeof path !== "string") {
    return null;
  }
  if (!CODE_FILE.test(path)) return null;
  return path.split(/[\\/]/).pop() ?? null;
}

/** A test runner: running it counts as running every changed file */
const TEST_RUNNER =
  /\b(pytest|unittest|vitest|jest|mocha|npm\s+(run\s+)?test|yarn\s+test|pnpm\s+test|go\s+test|cargo\s+(test|run)|go\s+run|deno\s+test|bun\s+test|make\s+test)\b/;
/** Runs a program, as opposed to reading or searching it */
const INTERPRETER =
  /(^|[\s;&|(`])(python3?|py|node|deno|bun|ruby|php|perl|bash|sh|zsh|pwsh|lua|tsx|ts-node)(\s|$)|(^|[\s;&|(])\.\/[\w.-]+/;
/** Only checks syntax: the code is not run */
const SYNTAX_ONLY =
  /-m\s+py_compile|-m\s+compileall|\bnode\s+(--check|-c)\b|\bbash\s+-n\b|\bsh\s+-n\b|\bphp\s+-l\b|\bruby\s+-c\b/;

/**
 * The changed files a command runs: all of them for a test runner, else
 * those it names (or imports by name) after an interpreter. A syntax check
 * runs none of them.
 */
export function filesRun(command: string, changed: Iterable<string>): string[] {
  const names = [...changed];
  if (TEST_RUNNER.test(command)) return names;
  if (!INTERPRETER.test(command)) return [];
  // Each piece of the command line on its own: `python3 -m py_compile
  // spend.py && python3 spend.py list` runs it in the second piece
  const pieces = command
    .split(/&&|\|\||;|\n/)
    .filter((piece) => INTERPRETER.test(piece) && !SYNTAX_ONLY.test(piece));
  return names.filter((name) => {
    const stem = name.replace(/\.[^.]+$/, "");
    const word = (text: string) =>
      new RegExp(`(^|[^\\w.-])${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`);
    return pieces.some((piece) => word(name).test(piece) || word(stem).test(piece));
  });
}

/** Sent once, when the model answers with changed code that never ran */
export function runReminder(files: string[]): string {
  const list = files.join(", ");
  return `[SHIELD: you changed ${list} in this request and nothing has run ${files.length === 1 ? "it" : "them"} since. Before you answer, run ${files.length === 1 ? "it" : "them"} once the way the user would (or its tests), on throwaway data so nothing of theirs changes, and fix what fails. If the user asked you not to run it, or it cannot run here, do not run it: say so in your answer instead.]`;
}
