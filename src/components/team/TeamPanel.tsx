/**
 * The Team panel: the agents of a Team session, each with its icon and
 * state, and a view of the one the user opens - what it says and does, as it
 * happens. Collapses to a rail of icons. Follows the newest working agent
 * until the user picks one.
 */

import { LocateFixed, PanelRightClose, PanelRightOpen } from "lucide-react";
import type { AgentRunView } from "@/agents/runView";
import { latestRun } from "@/agents/runView";
import { cn } from "@/lib/utils";
import { selectedRun, useTeamStore } from "@/stores/team-store";
import { AgentDetail } from "./AgentDetail";
import { AgentIcon } from "./AgentIcon";
import { ROLE_LOOKS, STATUS_LOOK } from "./agentLooks";

const NO_RUNS: AgentRunView[] = [];

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

function AgentRow({
  run,
  selected,
  onSelect,
}: {
  run: AgentRunView;
  selected: boolean;
  onSelect: () => void;
}) {
  const status = STATUS_LOOK[run.status];
  const steps = run.steps.filter((step) => step.kind === "tool").length;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60",
        selected && "bg-accent"
      )}
    >
      <AgentIcon role={run.role} status={run.status} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-medium">
            {ROLE_LOOKS[run.role].label}
          </span>
          <span className={cn("text-[11px]", status.text)}>{status.label}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {oneLine(run.task)}
        </span>
      </span>
      <span
        className="shrink-0 text-[11px] text-muted-foreground"
        title="Tool calls"
      >
        {steps}
      </span>
    </button>
  );
}

interface TeamPanelProps {
  conversationId: string | undefined;
  /** The session is in Team mode: show the panel even before an agent starts */
  teamMode: boolean;
}

export function TeamPanel({ conversationId, teamMode }: TeamPanelProps) {
  const runs = useTeamStore((state) =>
    conversationId
      ? (state.runsByConversation[conversationId] ?? NO_RUNS)
      : NO_RUNS
  );
  const selectedRunId = useTeamStore((state) => state.selectedRunId);
  const followLatest = useTeamStore((state) => state.followLatest);
  const collapsed = useTeamStore((state) => state.collapsed);
  const { select, follow, setCollapsed } = useTeamStore.getState();

  if (!teamMode && runs.length === 0) return null;

  const open = selectedRun(runs, selectedRunId);
  const working = runs.filter((run) => run.status === "running").length;

  if (collapsed) {
    return (
      <aside
        aria-label="Team"
        className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-l py-2"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Show the team"
          aria-label="Show the team"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        {runs.map((run) => (
          <button
            key={run.id}
            type="button"
            onClick={() => {
              select(run.id);
              setCollapsed(false);
            }}
            title={`${ROLE_LOOKS[run.role].label}: ${STATUS_LOOK[run.status].label}`}
            aria-label={`${ROLE_LOOKS[run.role].label}, ${STATUS_LOOK[run.status].label}`}
          >
            <AgentIcon role={run.role} status={run.status} />
          </button>
        ))}
      </aside>
    );
  }

  return (
    <aside
      aria-label="Team"
      className="flex h-full w-80 max-w-[45%] shrink-0 flex-col border-l"
    >
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <span className="text-sm font-medium">Team</span>
        <span className="text-xs text-muted-foreground">
          {runs.length === 0
            ? ""
            : working > 0
              ? `${working} working`
              : `${runs.length} ${runs.length === 1 ? "agent" : "agents"}`}
        </span>
        <span className="flex-1" />
        {!followLatest && runs.length > 0 && conversationId && (
          <button
            type="button"
            onClick={() => follow(conversationId)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Follow the agent that is working"
            aria-label="Follow the agent that is working"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Collapse the team"
          aria-label="Collapse the team"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {runs.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          No agents yet. When the orchestrator hands work to a coder, tester or
          reviewer, each appears here and you can watch it work.
        </p>
      ) : (
        <>
          <div
            className={cn(
              "space-y-0.5 overflow-y-auto p-1.5",
              open ? "max-h-40 shrink-0 border-b" : "flex-1"
            )}
          >
            {runs.map((run) => (
              <AgentRow
                key={run.id}
                run={run}
                selected={run.id === open?.id}
                onSelect={() => select(run.id)}
              />
            ))}
          </div>
          {open && (
            <AgentDetail key={open.id} run={open} onBack={() => select(null)} />
          )}
          {!open && latestRun(runs) && (
            <p className="px-4 py-2 text-center text-xs text-muted-foreground">
              Pick an agent to watch it work.
            </p>
          )}
        </>
      )}
    </aside>
  );
}
