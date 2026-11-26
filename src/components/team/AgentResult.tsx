/**
 * How a finished agent ended, first in its view: a sentence or two (its own
 * SUMMARY line, else the start of its report), why it stopped if it did not
 * finish, then SHIELD's record. The full report is one click away; shown at
 * once it was a wall of text in a narrow column (2026-11-16).
 */

import { useState } from "react";
import { ChevronRight, CircleAlert } from "lucide-react";
import type { AgentRunView } from "@/agents/runView";
import { cn } from "@/lib/utils";
import { CompactMarkdown } from "./CompactMarkdown";
import { WorkSummary } from "./WorkSummary";

export function AgentResult({ run }: { run: AgentRunView }) {
  const [full, setFull] = useState(false);
  const brief = run.brief?.trim() || "";
  const report = run.summary?.trim() || "";
  // The full report says more than the brief: worth the toggle
  const more = report.length > 0 && report !== brief;

  return (
    <div className="space-y-2 text-xs" data-testid="agent-result">
      {run.reason && (
        <p className="flex gap-1.5 text-amber-700 dark:text-amber-400">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {run.reason}
        </p>
      )}
      {(brief || report) && (
        <div className="rounded-md border border-border/60 p-2 text-foreground/90">
          <CompactMarkdown text={full || !brief ? report : brief} />
          {more && brief && (
            <button
              type="button"
              onClick={() => setFull((v) => !v)}
              className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  full && "rotate-90"
                )}
                aria-hidden
              />
              {full ? "Show less" : "Show the full report"}
            </button>
          )}
        </div>
      )}
      <WorkSummary work={run.work} lines={run.workLines} />
    </div>
  );
}
