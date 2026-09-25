/**
 * Work Group
 *
 * A stretch of work in a reply - tool steps, summaries and the short lines
 * the model wrote on the way - as one collapsible line instead of a line
 * each ("I'll continue examining the remaining files." / "Read f3.ps1", a
 * dozen times over). While it is the reply's latest part and still running,
 * its header says what is happening now ("Reading MISTAKES.md…"); once done,
 * what it did ("Read 12 files, listed wifi · summarised 3 times").
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Layers, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTokens } from "@/lib/format";
import { stripToolCallMarkup } from "@/handlers/toolCallParsing";
import { useGenerationStore } from "@/store/generationStore";
import { useSummaryFocus } from "@/stores/summary-focus-store";
import { SummaryStep, ToolStep } from "./ToolStep";
import { stepLabel, workLabel, type WorkItem } from "./turns";

/** What the reply is doing right now, for its latest part */
export interface LiveWork {
  runningTool?: { tool: string; serverName: string; target?: string } | null;
  /** Generating, with no text on screen yet */
  busy: boolean;
}

/** The header while the group is still at work; null once it is done */
function useLiveLabel(live: LiveWork | null | undefined): string | null {
  const progress = useGenerationStore((state) => state.progress);
  if (!live) return null;
  if (live.runningTool) {
    const { tool, serverName, target } = live.runningTool;
    return `${stepLabel(tool, serverName, target, "running")}…`;
  }
  if (!live.busy) return null;
  if (progress?.phase === "summarising") return "Summarising earlier turns…";
  if (progress?.phase === "writing" && progress.generated > 2) {
    return `Thinking · ↓ ${formatTokens(progress.generated)} tokens…`;
  }
  if (progress?.phase === "reading" && progress.total > progress.cached) {
    const read = progress.done - progress.cached;
    const toRead = progress.total - progress.cached;
    return `Reading the conversation · ${formatTokens(read)} / ${formatTokens(toRead)} tokens…`;
  }
  return "Reading the conversation…";
}

function WorkItemView({ item }: { item: WorkItem }) {
  const message = item.message;
  if (item.kind === "summary") {
    return <SummaryStep id={message.id} summary={message.summary ?? ""} />;
  }
  if (item.kind === "narration") {
    return (
      <p className="py-0.5 text-[13px] text-muted-foreground/80">
        {stripToolCallMarkup(message.content).trim()}
      </p>
    );
  }
  const result = message.toolResult!;
  return (
    <ToolStep
      tool={result.tool}
      serverName={result.serverName}
      target={result.target}
      success={result.success}
      blocked={result.blocked}
      content={message.content}
    />
  );
}

interface WorkGroupProps {
  items: WorkItem[];
  /** Set while this is the live reply's latest part */
  live?: LiveWork | null;
}

export function WorkGroup({ items, live }: WorkGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const liveLabel = useLiveLabel(live);

  // Picked in the header's summaries menu: open, so the step can show itself
  const holdsFocus = useSummaryFocus(
    (state) =>
      state.focusedId !== null &&
      items.some(
        (item) => item.kind === "summary" && item.message.id === state.focusedId
      )
  );
  useEffect(() => {
    if (holdsFocus) setExpanded(true);
  }, [holdsFocus]);

  const failed = items.filter(
    (item) =>
      item.kind === "tool" &&
      !item.message.toolResult?.success &&
      !item.message.toolResult?.blocked
  ).length;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group/step flex max-w-full items-center gap-2 py-0.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {liveLabel ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <Layers className="h-3.5 w-3.5 shrink-0" />
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={liveLabel ?? "done"}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="truncate"
          >
            {liveLabel ?? workLabel(items)}
          </motion.span>
        </AnimatePresence>
        {!liveLabel && failed > 0 && (
          <span className="shrink-0 text-destructive/80">
            · {failed} failed
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover/step:opacity-100",
            expanded && "rotate-90"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1 mb-2 ml-1.5 space-y-0.5 border-l border-border/60 pl-3">
              {items.map((item) => (
                <WorkItemView
                  key={`${item.kind}-${item.message.id}`}
                  item={item}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
