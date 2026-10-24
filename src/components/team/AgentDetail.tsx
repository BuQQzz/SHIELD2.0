/**
 * One agent's run, as it happens: what it says, each tool it calls and what
 * came back, the text it is writing now, and how it ended.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  Loader2,
  X,
} from "lucide-react";
import type { AgentRunView, RunStep } from "@/agents/runView";
import { cn } from "@/lib/utils";
import { stepLabel } from "@/components/chat/turns";
import { streamingToolCallPreview } from "@/handlers/toolCallParsing";
import { AgentIcon } from "./AgentIcon";
import { ROLE_LOOKS, STATUS_LOOK } from "./agentLooks";

const serverOf = (tool: string) =>
  tool === "run_command" ? "terminal" : "filesystem";

function ToolRow({ step }: { step: Extract<RunStep, { kind: "tool" }> }) {
  const [open, setOpen] = useState(false);
  const running = step.state === "running";
  const label = stepLabel(
    step.tool,
    serverOf(step.tool),
    step.target,
    running ? "running" : "done"
  );
  const Mark =
    step.state === "running"
      ? Loader2
      : step.state === "ok"
        ? Check
        : step.state === "refused"
          ? Ban
          : X;
  return (
    <div className="text-[12.5px]">
      <button
        type="button"
        disabled={!step.text}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-muted-foreground hover:bg-accent/50 disabled:hover:bg-transparent"
      >
        <Mark
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            step.state === "running" && "animate-spin",
            step.state === "ok" && "text-emerald-600 dark:text-emerald-400",
            step.state === "failed" && "text-red-600 dark:text-red-400",
            step.state === "refused" && "text-amber-600 dark:text-amber-400"
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">
          {label}
          {step.state === "refused" && " - not allowed"}
        </span>
        {step.text && (
          <ChevronRight
            className={cn(
              "h-3 w-3 shrink-0 transition-transform",
              open && "rotate-90"
            )}
            aria-hidden
          />
        )}
      </button>
      {open && step.text && (
        <pre className="mx-1 mb-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/60 p-2 font-mono text-[11.5px] text-foreground/80">
          {step.text}
        </pre>
      )}
    </div>
  );
}

/**
 * "Editing calc.py…" for a call the agent is still writing; a tool the chat
 * has no words for is "Using <tool>…". The call's markup itself showed in the
 * panel until the call was complete (2026-10-24).
 */
function pendingLabel(tool: string, target: string | undefined): string {
  if (!tool) return "Preparing a tool call…";
  const label = stepLabel(tool, "", target, "running");
  return `${label.startsWith(".") ? `Using ${tool}` : label}…`;
}

interface AgentDetailProps {
  run: AgentRunView;
  onBack: () => void;
}

export function AgentDetail({ run, onBack }: AgentDetailProps) {
  const [taskOpen, setTaskOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  /** Follows the bottom while the user is there; lets go when they scroll up */
  const stuck = useRef(true);
  const status = STATUS_LOOK[run.status];
  const live = useMemo(() => streamingToolCallPreview(run.live), [run.live]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [run.steps, run.live, run.status]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="agent-detail">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
          aria-label="Back to the agents"
        >
          All
        </button>
        <AgentIcon role={run.role} status={run.status} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-medium">
              {ROLE_LOOKS[run.role].label}
            </span>
            <span className={cn("text-xs", status.text)}>{status.label}</span>
          </div>
        </div>
        <div
          className="flex w-16 shrink-0 flex-col items-end gap-0.5"
          title={`${run.contextPercent}% of the agent's context window`}
        >
          <span className="text-[10px] text-muted-foreground">
            {run.contextPercent}%
          </span>
          <span className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <span
              className={cn(
                "block h-full rounded-full",
                run.contextPercent >= 70 ? "bg-amber-500" : "bg-sky-500"
              )}
              style={{ width: `${Math.min(100, run.contextPercent)}%` }}
            />
          </span>
        </div>
      </div>

      <div
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2"
      >
        <button
          type="button"
          onClick={() => setTaskOpen((v) => !v)}
          className="w-full rounded-md bg-muted/50 p-2 text-left text-xs text-muted-foreground"
        >
          <span className="font-medium text-foreground/80">Task </span>
          {run.continuesFrom && <span>(continues {run.continuesFrom}) </span>}
          <span
            className={cn("whitespace-pre-wrap", !taskOpen && "line-clamp-3")}
          >
            {run.task}
          </span>
        </button>

        {run.steps.map((step) =>
          step.kind === "say" ? (
            <p
              key={step.id}
              className="whitespace-pre-wrap text-[13px] leading-snug"
            >
              {step.text}
            </p>
          ) : (
            <ToolRow key={step.id} step={step} />
          )
        )}

        {run.status === "running" &&
          (live.text || live.pendingTool !== null ? (
            <>
              {live.text && (
                <p className="whitespace-pre-wrap text-[13px] leading-snug">
                  {live.text}
                  {live.pendingTool === null && (
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-foreground/60 align-middle" />
                  )}
                </p>
              )}
              {live.pendingTool !== null && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  {pendingLabel(live.pendingTool, live.pendingTarget)}
                </p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Thinking
            </p>
          ))}

        {run.checkpointed && (
          <p className="rounded-md bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
            Its context reached the checkpoint, so it was told to stop and hand
            its work over.
          </p>
        )}

        {run.status !== "running" && (
          <div className="space-y-1.5 border-t pt-2 text-xs">
            {run.reason && (
              <p className="flex gap-1.5 text-amber-700 dark:text-amber-400">
                <CircleAlert
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden
                />
                {run.reason}
              </p>
            )}
            {run.summary && (
              <p className="whitespace-pre-wrap text-foreground/90">
                {run.summary}
              </p>
            )}
            {run.workLines.length > 0 && (
              <div className="rounded-md bg-muted/50 p-2 text-muted-foreground">
                <p className="mb-0.5 font-medium text-foreground/80">
                  Checked by SHIELD
                </p>
                {run.workLines.map((line) => (
                  <p key={line} className="break-words">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
