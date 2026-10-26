/**
 * The hand-off: what an agent leaves so a fresh one can carry on.
 *
 * Two halves. The agent writes the narrative (what is done, in progress,
 * next). SHIELD writes the facts from the tools' own results (files changed,
 * commands run and their exit codes), because a small model's account of its
 * own work is often wrong - and the facts are there even if the agent was
 * cut off before it wrote anything.
 */

import type { AgentStatus, ParsedHandoff, VerifiedWork } from "./types";

/** What the agent is told to write, in its prompt and at a checkpoint */
export const HANDOFF_FORMAT = `HANDOFF
STATUS: DONE | PARTIAL | BLOCKED
DONE: what is finished, one line each
IN PROGRESS: what you were in the middle of
NEXT: the exact next step for whoever continues
NOTES: anything they must know (a failing test's name, a decision, a gotcha)`;

const FIELDS = [
  ["status", /^STATUS\s*:\s*(.*)$/i],
  ["done", /^DONE\s*:\s*(.*)$/i],
  ["inProgress", /^IN[ -]PROGRESS\s*:\s*(.*)$/i],
  ["next", /^NEXT(?: STEP)?\s*:\s*(.*)$/i],
  ["notes", /^NOTES?\s*:\s*(.*)$/i],
] as const;

type Field = (typeof FIELDS)[number][0];

const HEADING = /^\s*(?:#{1,6}\s*|\*{2})?HANDOFF\b[\s*:]*$/i;

/**
 * The last HANDOFF block in a reply. Lenient about markdown ("## HANDOFF",
 * "**STATUS:** DONE"); `found` is false when there is none.
 */
export function parseHandoff(text: string): ParsedHandoff {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  lines.forEach((line, i) => {
    if (HEADING.test(line)) start = i;
  });
  const empty: ParsedHandoff = {
    found: false,
    done: "",
    inProgress: "",
    next: "",
    notes: "",
  };
  if (start < 0) return empty;

  const values: Record<Field, string[]> = {
    status: [],
    done: [],
    inProgress: [],
    next: [],
    notes: [],
  };
  let current: Field | null = null;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.replace(/\*\*/g, "").trim();
    const hit = FIELDS.find(([, pattern]) => pattern.test(line));
    if (hit) {
      current = hit[0];
      values[current].push(line.replace(hit[1], "$1").trim());
    } else if (current && line) {
      values[current].push(line);
    }
  }

  const statusWord = /\b(DONE|PARTIAL|BLOCKED)\b/i.exec(
    values.status.join(" ")
  )?.[1];
  const join = (field: Field) => values[field].filter(Boolean).join("\n");
  return {
    found: true,
    status: statusWord?.toUpperCase() as ParsedHandoff["status"],
    done: join("done"),
    inProgress: join("inProgress"),
    next: join("next"),
    notes: join("notes"),
  };
}

/** The reply without its HANDOFF block: the part meant for the reader */
export function stripHandoff(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let start = -1;
  lines.forEach((line, i) => {
    if (HEADING.test(line)) start = i;
  });
  return (start < 0 ? text : lines.slice(0, start).join("\n")).trim();
}

const action = (file: VerifiedWork["files"][number]) =>
  `${file.path} ${file.action}${file.ok ? "" : " (FAILED)"}${
    file.changedChecks
      ? ` (changed ${file.changedChecks} existing test check${file.changedChecks === 1 ? "" : "s"}: tell the user)`
      : ""
  }`;

/** Ends a `refused` entry for a call the user turned down at the approval bar */
export const DENIED_BY_USER = "(denied by the user)";

/** SHIELD's facts as lines, for the orchestrator and for a fresh agent */
export function describeWork(work: VerifiedWork): string[] {
  const lines: string[] = [];
  lines.push(
    work.files.length
      ? `- files: ${work.files.map(action).join("; ")}`
      : "- files: none changed"
  );
  lines.push(
    work.commands.length
      ? `- commands: ${work.commands
          .map(
            (c) =>
              `${c.command} -> ${c.exitCode === null ? "no exit code" : `exit ${c.exitCode}`}${
                c.suspectLines > 0
                  ? ` (${c.suspectLines} output line${c.suspectLines === 1 ? "" : "s"} looked like failures)`
                  : ""
              }`
          )
          .join("; ")}`
      : "- commands: none run"
  );
  if (work.refused.length) lines.push(`- refused: ${work.refused.join("; ")}`);
  return lines;
}

/**
 * What a fresh agent gets in place of the old one's conversation: the
 * previous agent's hand-off plus SHIELD's facts, and nothing else.
 */
export function handoffNote(input: {
  fromRole: string;
  status: AgentStatus;
  parsed: ParsedHandoff;
  work: VerifiedWork;
}): string {
  const { parsed } = input;
  const part = (label: string, text: string) =>
    text ? [`${label}: ${text}`] : [];
  return [
    `The previous ${input.fromRole} stopped with status ${input.status}. You are continuing its work. Its conversation is gone; this is everything you have:`,
    ...part("DONE", parsed.done),
    ...part("IN PROGRESS", parsed.inProgress),
    ...part("NEXT", parsed.next),
    ...part("NOTES", parsed.notes),
    "Checked by SHIELD from the tools' results (trust this over the notes above):",
    ...describeWork(input.work),
    "Read the files you need before changing anything: do not assume the notes are complete.",
  ].join("\n");
}

export const EMPTY_WORK: VerifiedWork = {
  files: [],
  commands: [],
  refused: [],
};
