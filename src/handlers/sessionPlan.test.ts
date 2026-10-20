import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/types/conversation";
import type { Conversation } from "@/types/electron";
import { useConversationStore } from "@/stores/conversation-store";
import { formatToolResult } from "./mcpToolHandler";
import {
  checkPlan,
  editPlan,
  finishOpenPlanSteps,
  forgetPlanSeen,
  planRemarks,
  PLAN_REMINDER_EVERY,
  savePlanFromCall,
  takePlanNote,
} from "./sessionPlan";
import type { Plan, PlanStep } from "@/config/plan";

let id = 0;
const message = (
  role: Message["role"],
  content: string,
  toolResult?: Message["toolResult"]
): Message => ({
  id: String(id++),
  role,
  content,
  timestamp: new Date(),
  ...(toolResult ? { toolResult } : {}),
});

/** An edit of cart.js that never matched */
const failedEdit = (): Message[] => [
  message(
    "assistant",
    `<tool_call>\n<server>filesystem</server>\n<tool>edit_file</tool>\n<arguments>${JSON.stringify(
      {
        path: "cart.js",
        edits: [{ oldText: "return sum;", newText: "return sum * 1.2;" }],
      }
    )}</arguments>\n</tool_call>`
  ),
  message(
    "user",
    formatToolResult(
      { serverName: "filesystem", tool: "edit_file", arguments: {} },
      { success: false, error: "Could not find exact match for edit" }
    ),
    {
      tool: "edit_file",
      serverName: "filesystem",
      success: false,
      target: "cart.js",
    }
  ),
];

const steps: PlanStep[] = [
  { step: "Fix the total in cart.js", status: "completed" },
  { step: "Run the tests", status: "pending" },
];

const conversation = (plan?: Plan): Conversation => ({
  id: "conv-plan",
  title: "Cart",
  messages: [message("user", "fix the cart")],
  createdAt: new Date(),
  updatedAt: new Date(),
  kind: "code",
  ...(plan ? { plan } : {}),
});

beforeEach(() => {
  forgetPlanSeen();
  useConversationStore.setState({
    currentConversation: conversation(),
    saveCurrentConversation: vi.fn(async () => {}),
  });
});

describe("planRemarks", () => {
  it("does not take a step as done while the record shows its edit missing", () => {
    const files = new Map([["cart.js", "return sum;"]]);
    expect(planRemarks(steps, failedEdit(), files)).toEqual(
      new Map([
        [
          0,
          "not confirmed: SHIELD's record shows an edit of cart.js failed, and the file still does not have its change",
        ],
      ])
    );
  });

  it("has nothing to say once the change is in the file", () => {
    const files = new Map([["cart.js", "return sum * 1.2;"]]);
    expect(planRemarks(steps, failedEdit(), files).size).toBe(0);
  });

  it("leaves open steps alone", () => {
    const files = new Map([["cart.js", "return sum;"]]);
    const open: PlanStep[] = [{ step: "Fix cart.js", status: "in_progress" }];
    expect(planRemarks(open, failedEdit(), files).size).toBe(0);
  });
});

describe("saving the plan", () => {
  it("saves the model's plan after an update_plan that went through", () => {
    savePlanFromCall(
      "update_plan",
      { plan: steps, explanation: "Halfway" },
      { success: true }
    );
    const plan = useConversationStore.getState().currentConversation?.plan;
    expect(plan).toMatchObject({ steps, note: "Halfway", by: "model" });
  });

  it("ignores failed calls and other tools", () => {
    savePlanFromCall("update_plan", { plan: steps }, { success: false });
    savePlanFromCall("write_file", { plan: steps }, { success: true });
    expect(
      useConversationStore.getState().currentConversation?.plan
    ).toBeUndefined();
  });

  it("an empty plan clears it", () => {
    savePlanFromCall("update_plan", { plan: steps }, { success: true });
    savePlanFromCall("update_plan", { plan: [] }, { success: true });
    expect(
      useConversationStore.getState().currentConversation?.plan
    ).toBeUndefined();
  });

  it("saves the user's edit at once, marked as theirs", async () => {
    savePlanFromCall(
      "update_plan",
      { plan: steps, explanation: "Halfway" },
      { success: true }
    );
    await editPlan([{ step: "Only this", status: "pending" }]);
    const state = useConversationStore.getState();
    expect(state.currentConversation?.plan).toMatchObject({
      steps: [{ step: "Only this", status: "pending" }],
      note: "Halfway",
      by: "user",
    });
    expect(state.saveCurrentConversation).toHaveBeenCalled();
  });

  it("keeps SHIELD's check on the plan after a turn, and drops it when fixed", () => {
    savePlanFromCall("update_plan", { plan: steps }, { success: true });
    checkPlan(failedEdit(), new Map([["cart.js", "return sum;"]]));
    expect(
      useConversationStore.getState().currentConversation?.plan?.remarks
    ).toEqual({ 0: expect.stringContaining("not confirmed") });
    checkPlan(failedEdit(), new Map([["cart.js", "return sum * 1.2;"]]));
    expect(
      useConversationStore.getState().currentConversation?.plan
    ).not.toHaveProperty("remarks");
  });
});

describe("takePlanNote", () => {
  const plan: Plan = {
    steps,
    updatedAt: "2026-09-28T20:00:00.000Z",
    by: "user",
  };
  const turns = (n: number) =>
    Array.from({ length: n }, () => message("user", "next"));

  it("sends the plan, then again only when it changed or every few messages", () => {
    expect(takePlanNote("c", turns(1), plan, new Map())).toContain(
      "[ ] Run the tests"
    );
    expect(takePlanNote("c", turns(2), plan, new Map())).toBe("");
    const edited = {
      ...plan,
      steps: [...steps, { step: "Commit", status: "pending" as const }],
    };
    expect(takePlanNote("c", turns(3), edited, new Map())).toContain("Commit");
    expect(
      takePlanNote("c", turns(3 + PLAN_REMINDER_EVERY - 1), edited, new Map())
    ).toBe("");
    expect(
      takePlanNote("c", turns(3 + PLAN_REMINDER_EVERY), edited, new Map())
    ).toContain("Commit");
  });

  it("does not resend the plan the model just wrote", () => {
    useConversationStore.setState({ currentConversation: conversation() });
    savePlanFromCall("update_plan", { plan: steps }, { success: true });
    const saved = useConversationStore.getState().currentConversation!;
    expect(takePlanNote(saved.id, saved.messages, saved.plan, new Map())).toBe(
      ""
    );
  });

  it("sends a new remark at once", () => {
    takePlanNote("c", turns(1), plan, new Map());
    expect(
      takePlanNote("c", turns(1), plan, new Map([[0, "not confirmed"]]))
    ).toContain("not confirmed");
  });
});

describe("finishOpenPlanSteps", () => {
  const setPlan = (planSteps: PlanStep[]) =>
    useConversationStore.setState({
      currentConversation: {
        ...conversation(),
        plan: {
          steps: planSteps,
          updatedAt: "2026-10-20T00:00:00Z",
          by: "model",
        },
      },
    });
  const planNow = () =>
    useConversationStore.getState().currentConversation?.plan;

  // Live: the orchestrator answered without a last update_plan, and the plan
  // read "3 of 4 done" beside a finished review
  it("finishes the step left in progress and leaves pending steps alone", () => {
    setPlan([
      { step: "Fix the bug", status: "completed" },
      { step: "Run the tests", status: "completed" },
      { step: "Review the change", status: "in_progress" },
      { step: "Write the changelog", status: "pending" },
    ]);
    finishOpenPlanSteps();
    expect(planNow()?.steps.map((s) => s.status)).toEqual([
      "completed",
      "completed",
      "completed",
      "pending",
    ]);
    expect(planNow()?.by).toBe("model");
  });

  it("does nothing without a plan, or with nothing in progress", () => {
    finishOpenPlanSteps();
    expect(planNow()).toBeUndefined();
    setPlan([{ step: "Done already", status: "completed" }]);
    const before = planNow();
    finishOpenPlanSteps();
    expect(planNow()).toBe(before);
  });
});
