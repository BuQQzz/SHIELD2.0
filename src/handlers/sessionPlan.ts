/**
 * The open session's plan (src/config/plan.ts): saved from the model's
 * update_plan calls and the user's edits, and checked against SHIELD's
 * record (workLedger).
 *
 * The check: a step marked completed that names a file whose edit failed -
 * and whose change is still not in the file - is not shown as done on the
 * model's word alone. Qwen3-Coder reported its failed GUID edit as applied
 * for a whole session (2026-09-27/28); a checklist ticked by the same model
 * would repeat that.
 */

import type { Message } from "../types/conversation";
import {
  parsePlanArguments,
  planNote,
  UPDATE_PLAN_TOOL_NAME,
  type Plan,
  type PlanStep,
} from "../config/plan";
import type { MCPToolResult } from "../types/electron";
import { useConversationStore } from "../stores/conversation-store";
import { failedEdits, isApplied, type FileContents } from "./workLedger";

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** Remarks by step index, for completed steps the record contradicts */
export function planRemarks(
  steps: PlanStep[],
  messages: Message[],
  files: FileContents
): Map<number, string> {
  const remarks = new Map<number, string>();
  const missing = failedEdits(messages).filter(
    (edit) => isApplied(edit, files) === false
  );
  if (missing.length === 0) return remarks;
  steps.forEach((s, i) => {
    if (s.status !== "completed") return;
    const text = s.step.toLowerCase();
    const edit = missing.find((e) =>
      text.includes(baseName(e.path).toLowerCase())
    );
    if (edit) {
      remarks.set(
        i,
        `not confirmed: SHIELD's record shows an edit of ${baseName(edit.path)} failed, and the file still does not have its change`
      );
    }
  });
  return remarks;
}

/**
 * What the model last saw of each conversation's plan, and at which of the
 * user's messages. The plan goes with a message when it changed since -
 * the user edited it, or SHIELD's check has a new remark - and otherwise
 * every few messages, so it stays near the end of the model's context
 * without costing ~150 tokens on every message. Forgotten when the model's
 * history is rebuilt from the saved chat (useConversationSync).
 */
const seen = new Map<string, { key: string; turn: number }>();
/** Messages between reminders of an unchanged plan */
export const PLAN_REMINDER_EVERY = 4;

const planKey = (plan: Plan, remarks?: Map<number, string>) =>
  JSON.stringify([plan.steps, plan.by, [...(remarks ?? [])]]);

/** The user's messages so far, not counting tool results */
const userTurns = (messages: Message[]) =>
  messages.filter((m) => m.role === "user" && !m.toolResult).length;

/** The plan with its steps replaced, or none when no steps are left */
function withSteps(
  steps: PlanStep[],
  by: Plan["by"],
  note?: string
): Plan | undefined {
  if (steps.length === 0) return undefined;
  return {
    steps,
    ...(note ? { note } : {}),
    updatedAt: new Date().toISOString(),
    by,
  };
}

/** After an update_plan call that went through, the plan it sent */
export function savePlanFromCall(
  tool: string,
  args: Record<string, unknown>,
  result: MCPToolResult
): void {
  if (tool !== UPDATE_PLAN_TOOL_NAME || !result.success) return;
  const parsed = parsePlanArguments(args);
  if ("error" in parsed) return;
  const store = useConversationStore.getState();
  const plan = withSteps(parsed.steps, "model", parsed.note);
  store.updateConversation({ plan });
  // The model has this version: it just wrote it
  const conversation = store.currentConversation;
  if (plan && conversation) {
    seen.set(conversation.id, {
      key: planKey(plan, new Map()),
      turn: userTurns(conversation.messages),
    });
  }
}

/** The user's edit, saved at once; the model is told with the next message */
export async function editPlan(steps: PlanStep[]): Promise<void> {
  const store = useConversationStore.getState();
  const current = store.currentConversation?.plan;
  store.updateConversation({ plan: withSteps(steps, "user", current?.note) });
  await store.saveCurrentConversation();
}

/** The plan note to send with this message, or "" */
export function takePlanNote(
  conversationId: string,
  messages: Message[],
  plan: Plan | undefined,
  remarks: Map<number, string>
): string {
  const text = planNote(plan, remarks);
  if (!plan || !text) return "";
  const key = planKey(plan, remarks);
  const turn = userTurns(messages);
  const last = seen.get(conversationId);
  if (last?.key === key && turn - last.turn < PLAN_REMINDER_EVERY) return "";
  seen.set(conversationId, { key, turn });
  return text;
}

export function forgetPlanSeen(conversationId?: string): void {
  if (conversationId) seen.delete(conversationId);
  else seen.clear();
}

/** After a turn: SHIELD's check of the steps the model marked completed */
export function checkPlan(messages: Message[], files: FileContents): void {
  const store = useConversationStore.getState();
  const plan = store.currentConversation?.plan;
  if (!plan) return;
  const remarks = Object.fromEntries(planRemarks(plan.steps, messages, files));
  const had = JSON.stringify(plan.remarks ?? {});
  if (had === JSON.stringify(remarks)) return;
  const { remarks: _old, ...rest } = plan;
  store.updateConversation({
    plan: Object.keys(remarks).length ? { ...rest, remarks } : rest,
  });
}
