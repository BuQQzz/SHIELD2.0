/**
 * What SHIELD itself saw an agent do, under its report: the files it
 * changed and the commands it ran, with their results. The same record the
 * orchestrator reads, laid out for a person instead of as its text lines.
 */

import { Ban, Check, FileText, SquareTerminal, X } from "lucide-react";
import type { VerifiedWork } from "@/agents/types";
import { cn } from "@/lib/utils";
import { displayCommand, displayPath, exitCodeIsItsOwn } from "./workView";

const ACTION: Record<VerifiedWork["files"][number]["action"], string> = {
  written: "created",
  edited: "edited",
  moved: "moved",
  deleted: "deleted",
  directory: "folder made",
};

const ok = "text-emerald-600 dark:text-emerald-400";
const bad = "text-red-600 dark:text-red-400";

export function WorkSummary({
  work,
  lines,
}: {
  work?: VerifiedWork;
  /** Runs saved before the record was kept as data have only these */
  lines: string[];
}) {
  if (!work) {
    if (lines.length === 0) return null;
    return (
      <div className="rounded-md bg-muted/50 p-2 text-muted-foreground">
        <p className="mb-0.5 font-medium text-foreground/80">
          Checked by SHIELD
        </p>
        {lines.map((line) => (
          <p key={line} className="[overflow-wrap:anywhere]">
            {line.replace(/^- /, "")}
          </p>
        ))}
      </div>
    );
  }

  const { files, commands, refused } = work;
  return (
    <div className="space-y-1.5 rounded-md bg-muted/50 p-2 text-muted-foreground">
      <p className="font-medium text-foreground/80">Checked by SHIELD</p>
      {files.length === 0 ? (
        <p className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
          No files changed
        </p>
      ) : (
        <ul className="space-y-0.5">
          {files.map((file, i) => (
            <li
              key={`${file.path}-${i}`}
              className="flex items-start gap-1.5"
              title={file.path}
            >
              {file.ok ? (
                <Check
                  className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", ok)}
                  aria-hidden
                />
              ) : (
                <X
                  className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", bad)}
                  aria-hidden
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span className="min-w-0 truncate font-mono text-[11.5px] text-foreground/85">
                    {displayPath(file.path)}
                  </span>
                  <span className="shrink-0">
                    {file.ok
                      ? ACTION[file.action]
                      : `${ACTION[file.action]}, failed`}
                  </span>
                </span>
                {/* Its own line: beside the name it cut the name to "pteam…" */}
                {file.changedChecks ? (
                  <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                    Changed {file.changedChecks} existing test check
                    {file.changedChecks === 1 ? "" : "s"}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      {commands.length > 0 && (
        <ul className="space-y-0.5">
          {commands.map((command, i) => {
            const own = exitCodeIsItsOwn(command.command);
            const passed =
              own && command.exitCode === 0 && command.suspectLines === 0;
            // Piped and ended 0: it finished, but that is no pass
            const finished = !own && command.exitCode === 0;
            return (
              <li
                key={`${command.command}-${i}`}
                className="flex items-start gap-1.5"
                title={command.command}
              >
                <SquareTerminal
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    passed ? ok : finished ? "text-muted-foreground" : bad
                  )}
                  aria-hidden
                />
                {/* The status under the command, not beside it: a long
                    command beside it wrapped a word per line (2026-11-16) */}
                <span className="min-w-0 flex-1">
                  <code className="line-clamp-2 font-mono text-[11.5px] text-foreground/85 [overflow-wrap:anywhere]">
                    {displayCommand(command.command)}
                  </code>
                  <span
                    className={cn(
                      "block text-[11px]",
                      passed ? ok : finished ? "text-muted-foreground" : bad
                    )}
                  >
                    {command.exitCode === null
                      ? "Stopped"
                      : command.exitCode === 0
                        ? command.suspectLines
                          ? "Finished, but the output reported errors"
                          : finished
                            ? "Finished (piped, so its own result is not known)"
                            : "Passed"
                        : `Failed (exit ${command.exitCode})`}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {refused.length > 0 && (
        <ul className="space-y-0.5">
          {refused.map((line, i) => (
            <li key={`${line}-${i}`} className="flex items-start gap-1.5">
              <Ban
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
              <span className="[overflow-wrap:anywhere]">Not run: {line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
