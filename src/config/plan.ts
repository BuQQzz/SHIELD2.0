/**
 * Plan: a session's live checklist.
 *
 * The model keeps it with one tool, update_plan - a few short steps, each
 * pending, in progress or completed, and an optional note - shaped like
 * Codex's update_plan (codex-rs/core/src/tools/handlers/plan.rs), so a
 * model trained on that call writes it as it learned it. The user can edit
 * it too. SHIELD sends the current plan with each message while steps are
 * open (planNote), so it survives history clearing and restarts: it lives
 * on the conversation, not in the model's context.
 *
 * Shared by the main process (which lists and answers the tool) and the
 * chat (which saves the plan and shows it); relative imports only.
 */

export const PLAN_SERVER_NAME = "plan";
export const UPDATE_PLAN_TOOL_NAME = "update_plan";

export type PlanStatus = "pending" | "in_progress" | "completed";

export interface PlanStep {
  step: string;
  status: PlanStatus;
}

export interface Plan {
  steps: PlanStep[];
  /** One line on where things stand, from the model's last update */
  note?: string;
  updatedAt: string;
  /** Who changed it last: the model sees "the user changed it" */
  by: "model" | "user";
  /**
   * SHIELD's check after the last turn, by step index: completed steps the
   * record contradicts (planCheck.ts). Dropped whenever the plan changes.
   */
  remarks?: Record<number, string>;
}

/** Enough for a real task; a small model's context pays for every line */
export const MAX_STEPS = 12;
export const MAX_STEP_CHARS = 120;
export const MAX_NOTE_CHARS = 200;

export const UPDATE_PLAN_TOOL = {
  name: UPDATE_PLAN_TOOL_NAME,
  description:
    "Keep the plan for a task with several steps: the user sees it as a live checklist, and it is sent back to you with every message. Send the whole plan each time - 3 to 7 short steps, exactly one in_progress while you work. Mark a step completed only after it is done and checked. Changes nothing on the computer.",
  inputSchema: {
    type: "object",
    properties: {
      plan: {
        type: "array",
        description: "Every step, in order",
        items: {
          type: "object",
          properties: {
            step: { type: "string", description: "A few words" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
            },
          },
          required: ["step", "status"],
          additionalProperties: false,
        },
      },
      explanation: {
        type: "string",
        description: "Optional: one line on what changed or where things stand",
      },
    },
    required: ["plan"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export function isPlanTool(name: string): boolean {
  return name === UPDATE_PLAN_TOOL_NAME;
}

/** Words models use for the three states */
const STATUS_WORDS: Record<string, PlanStatus> = {
  pending: "pending",
  todo: "pending",
  not_started: "pending",
  in_progress: "in_progress",
  inprogress: "in_progress",
  active: "in_progress",
  doing: "in_progress",
  current: "in_progress",
  started: "in_progress",
  completed: "completed",
  complete: "completed",
  done: "completed",
  finished: "completed",
};

function statusOf(value: unknown): PlanStatus | null {
  if (value === undefined || value === null || value === "") return "pending";
  if (typeof value !== "string") return null;
  const word = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return STATUS_WORDS[word] ?? null;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/**
 * The plan in an update_plan call, or why it cannot be read. Lenient about
 * the shape - "steps" for "plan", a bare string for a pending step, "done"
 * for "completed" - since a refusal costs a small model a whole round.
 */
export function parsePlanArguments(
  args: Record<string, unknown>
): { steps: PlanStep[]; note?: string } | { error: string } {
  const list = args.plan ?? args.steps;
  if (!Array.isArray(list)) {
    return {
      error:
        'update_plan needs "plan": a list of steps, each {"step": "...", "status": "pending" | "in_progress" | "completed"}. Nothing was saved.',
    };
  }
  if (list.length > MAX_STEPS) {
    return {
      error: `The plan has ${list.length} steps; keep it to ${MAX_STEPS} or fewer short ones (group small steps together). Nothing was saved.`,
    };
  }
  const steps: PlanStep[] = [];
  for (const item of list) {
    const raw =
      typeof item === "string"
        ? { step: item }
        : item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};
    const text = typeof raw.step === "string" ? raw.step : raw.text;
    if (typeof text !== "string" || !text.trim()) {
      return {
        error: `Each step needs "step" text; got ${JSON.stringify(item)}. Nothing was saved.`,
      };
    }
    const status = statusOf(raw.status);
    if (!status) {
      return {
        error: `Unknown status ${JSON.stringify(raw.status)} for "${text.trim()}": use pending, in_progress or completed. Nothing was saved.`,
      };
    }
    steps.push({ step: clip(text.trim(), MAX_STEP_CHARS), status });
  }
  const explanation = args.explanation ?? args.note;
  const note =
    typeof explanation === "string" && explanation.trim()
      ? clip(explanation.trim(), MAX_NOTE_CHARS)
      : undefined;
  return note ? { steps, note } : { steps };
}

const MARKS: Record<PlanStatus, string> = {
  completed: "[x]",
  in_progress: "[>]",
  pending: "[ ]",
};

/** "[x] Read cart.js" lines, with SHIELD's remark on a step where it has one */
export function planLines(
  steps: PlanStep[],
  remarks: Map<number, string> = new Map()
): string[] {
  return steps.map((s, i) => {
    const remark = remarks.get(i);
    return `${MARKS[s.status]} ${s.step}${remark ? ` - ${remark}` : ""}`;
  });
}

export const isFinished = (plan: Plan | undefined) =>
  !plan?.steps.length || plan.steps.every((s) => s.status === "completed");

/** What update_plan answers: the plan as saved, and a nudge where it is off */
export function planSavedText(steps: PlanStep[]): string {
  if (steps.length === 0) return "Plan cleared.";
  const active = steps.filter((s) => s.status === "in_progress").length;
  const open = steps.some((s) => s.status !== "completed");
  const hint =
    active > 1
      ? "\nKeep one step in_progress at a time."
      : active === 0 && open
        ? "\nMark the step you work on next as in_progress."
        : "";
  return `Plan saved; the user sees it:\n${planLines(steps).join("\n")}${hint}`;
}

/** The tool's answer, as an MCP result (the main process runs it) */
export function runPlanTool(args: Record<string, unknown>): {
  success: boolean;
  data?: { content: { type: "text"; text: string }[] };
  error?: string;
} {
  const parsed = parsePlanArguments(args);
  if ("error" in parsed) return { success: false, error: parsed.error };
  return {
    success: true,
    data: { content: [{ type: "text", text: planSavedText(parsed.steps) }] },
  };
}

/**
 * The plan as sent with the user's message while it has open steps. Tells
 * the model when the user changed it, so the user's edits are followed.
 */
export function planNote(
  plan: Plan | undefined,
  remarks: Map<number, string> = new Map()
): string {
  if (!plan || isFinished(plan)) return "";
  const byUser =
    plan.by === "user"
      ? " The user changed it since your last update; follow their version."
      : "";
  const note = plan.note ? `\nNote: ${plan.note}` : "";
  return `[SHIELD: the plan for this session, as the user sees it.${byUser} Keep it current with update_plan as you work; ignore it if the user's message is about something else:\n${planLines(plan.steps, remarks).join("\n")}${note}]`;
}
