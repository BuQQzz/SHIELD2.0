/**
 * Plan Panel
 *
 * A code session's plan as a live checklist above the input: the model
 * keeps it with update_plan, and the user can tick, reword, add or remove
 * steps. The user's edits are saved at once and the model is told with the
 * next message (src/handlers/sessionPlan.ts).
 */

import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDot,
  ListChecks,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import type { Plan, PlanStatus, PlanStep } from "@/config/plan";
import { MAX_STEP_CHARS, MAX_STEPS } from "@/config/plan";

const OPEN_KEY = "shield.planOpen";

/** Whether the viewer left the panel open; a convenience, so it may be lost */
function savedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

const NEXT: Record<PlanStatus, PlanStatus> = {
  pending: "in_progress",
  in_progress: "completed",
  completed: "pending",
};

const LABEL: Record<PlanStatus, string> = {
  pending: "Not started",
  in_progress: "In progress",
  completed: "Done",
};

function StatusIcon({ status }: { status: PlanStatus }) {
  if (status === "completed") {
    return (
      <CircleCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
    );
  }
  if (status === "in_progress") {
    return <CircleDot className="h-3.5 w-3.5 text-primary" />;
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
}

interface StepRowProps {
  step: PlanStep;
  remark?: string;
  onChange: (step: PlanStep | null) => void;
}

function StepRow({ step, remark, onChange }: StepRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step.step);

  const finish = () => {
    setEditing(false);
    const text = draft.trim();
    if (!text) onChange(null);
    else if (text !== step.step) onChange({ ...step, step: text });
  };

  return (
    <li className="group flex items-start gap-2 py-0.5">
      <button
        onClick={() => onChange({ ...step, status: NEXT[step.status] })}
        className="mt-0.5 shrink-0 rounded"
        title={`${LABEL[step.status]} - click to change`}
        aria-label={`${step.step}: ${LABEL[step.status]}`}
      >
        <StatusIcon status={step.status} />
      </button>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={MAX_STEP_CHARS}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={(e) => {
              if (e.key === "Enter") finish();
              if (e.key === "Escape") {
                setDraft(step.step);
                setEditing(false);
              }
            }}
            className="w-full rounded border border-border bg-background px-1 text-xs text-foreground outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraft(step.step);
              setEditing(true);
            }}
            className={`w-full text-left ${
              step.status === "completed"
                ? "text-muted-foreground line-through decoration-muted-foreground/40"
                : step.status === "in_progress"
                  ? "font-medium text-foreground"
                  : "text-foreground"
            }`}
            title="Click to reword"
          >
            {step.step}
          </button>
        )}
        {remark && (
          <p className="text-amber-700 dark:text-amber-300">{remark}</p>
        )}
      </div>
      <button
        onClick={() => onChange(null)}
        className="mt-0.5 shrink-0 rounded text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
        title="Remove this step"
        aria-label={`Remove ${step.step}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

interface PlanPanelProps {
  plan: Plan;
  onChange: (steps: PlanStep[]) => void;
}

export function PlanPanel({ plan, onChange }: PlanPanelProps) {
  const [open, setOpen] = useState(savedOpen);
  const [adding, setAdding] = useState("");

  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(OPEN_KEY, String(!open));
    } catch {
      // Blocked storage: the panel opens next time
    }
  };

  const done = plan.steps.filter((s) => s.status === "completed").length;
  const current =
    plan.steps.find((s) => s.status === "in_progress") ??
    plan.steps.find((s) => s.status === "pending");
  const flagged = Object.keys(plan.remarks ?? {}).length;

  const change = (index: number, step: PlanStep | null) =>
    onChange(
      step
        ? plan.steps.map((s, i) => (i === index ? step : s))
        : plan.steps.filter((_, i) => i !== index)
    );

  const add = () => {
    const text = adding.trim();
    if (!text || plan.steps.length >= MAX_STEPS) return;
    onChange([...plan.steps, { step: text, status: "pending" }]);
    setAdding("");
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5">
      <div className="rounded-md border border-border bg-muted/30 text-xs">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <ListChecks className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">Plan</span>
          <span className="text-muted-foreground">
            {done} of {plan.steps.length} done
          </span>
          {flagged > 0 && (
            <span className="text-amber-700 dark:text-amber-300">
              · {flagged} not confirmed
            </span>
          )}
          {!open && current && (
            <span className="min-w-0 truncate text-muted-foreground">
              · {current.step}
            </span>
          )}
        </button>
        {open && (
          <div className="border-t border-border px-2.5 py-1.5">
            <ol className="max-h-48 overflow-y-auto">
              {plan.steps.map((step, i) => (
                <StepRow
                  key={`${i}-${step.step}`}
                  step={step}
                  remark={plan.remarks?.[i]}
                  onChange={(next) => change(i, next)}
                />
              ))}
            </ol>
            {plan.note && (
              <p className="mt-1 text-muted-foreground">{plan.note}</p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={adding}
                maxLength={MAX_STEP_CHARS}
                disabled={plan.steps.length >= MAX_STEPS}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder={
                  plan.steps.length >= MAX_STEPS
                    ? `At most ${MAX_STEPS} steps`
                    : "Add a step"
                }
                className="min-w-0 flex-1 bg-transparent py-0.5 text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => onChange([])}
                className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                title="Remove the plan"
              >
                Clear plan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
