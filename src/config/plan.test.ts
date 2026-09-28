import { describe, expect, it } from "vitest";
import {
  MAX_STEP_CHARS,
  MAX_STEPS,
  parsePlanArguments,
  planNote,
  planSavedText,
  runPlanTool,
  type Plan,
} from "./plan";

const plan = (overrides: Partial<Plan> = {}): Plan => ({
  steps: [
    { step: "Read cart.js", status: "completed" },
    { step: "Fix the total", status: "in_progress" },
    { step: "Run the tests", status: "pending" },
  ],
  updatedAt: "2026-09-28T20:00:00.000Z",
  by: "model",
  ...overrides,
});

describe("parsePlanArguments", () => {
  it("reads Codex's update_plan shape", () => {
    expect(
      parsePlanArguments({
        explanation: "Starting with the bug",
        plan: [
          { step: "Read cart.js", status: "completed" },
          { step: "Fix the total", status: "in_progress" },
        ],
      })
    ).toEqual({
      steps: [
        { step: "Read cart.js", status: "completed" },
        { step: "Fix the total", status: "in_progress" },
      ],
      note: "Starting with the bug",
    });
  });

  it("takes the words small models use instead of refusing", () => {
    const parsed = parsePlanArguments({
      steps: [
        "Read the README",
        { step: "Fix it", status: "Done" },
        { step: "Test it", status: "in-progress" },
        { text: "Commit", status: "todo" },
      ],
    });
    expect(parsed).toEqual({
      steps: [
        { step: "Read the README", status: "pending" },
        { step: "Fix it", status: "completed" },
        { step: "Test it", status: "in_progress" },
        { step: "Commit", status: "pending" },
      ],
    });
  });

  it("says what is wrong and that nothing was saved", () => {
    expect(parsePlanArguments({})).toEqual({
      error: expect.stringContaining('needs "plan"'),
    });
    expect(
      parsePlanArguments({ plan: [{ step: "x", status: "blocked" }] })
    ).toEqual({ error: expect.stringContaining("Unknown status") });
    expect(parsePlanArguments({ plan: [{ status: "pending" }] })).toEqual({
      error: expect.stringContaining('needs "step" text'),
    });
    const tooMany = Array.from({ length: MAX_STEPS + 1 }, (_, i) => `s${i}`);
    const error = parsePlanArguments({ plan: tooMany });
    expect(error).toEqual({
      error: expect.stringMatching(/keep it to 12 or fewer.*Nothing was saved/),
    });
  });

  it("clips a long step instead of refusing it", () => {
    const parsed = parsePlanArguments({ plan: ["x".repeat(300)] });
    expect("steps" in parsed && parsed.steps[0]!.step.length).toBe(
      MAX_STEP_CHARS
    );
  });

  it("accepts an empty plan, which clears it", () => {
    expect(parsePlanArguments({ plan: [] })).toEqual({ steps: [] });
    expect(planSavedText([])).toBe("Plan cleared.");
  });
});

describe("the tool's answer", () => {
  it("shows the plan as saved", () => {
    const result = runPlanTool({ plan: plan().steps });
    expect(result.success).toBe(true);
    expect(result.data?.content[0]?.text).toBe(
      "Plan saved; the user sees it:\n[x] Read cart.js\n[>] Fix the total\n[ ] Run the tests"
    );
  });

  it("nudges towards one step in progress", () => {
    expect(
      planSavedText([
        { step: "a", status: "in_progress" },
        { step: "b", status: "in_progress" },
      ])
    ).toContain("Keep one step in_progress at a time.");
    expect(planSavedText([{ step: "a", status: "pending" }])).toContain(
      "Mark the step you work on next as in_progress."
    );
    expect(planSavedText([{ step: "a", status: "completed" }])).not.toContain(
      "Mark"
    );
  });

  it("fails without saving when the plan cannot be read", () => {
    expect(runPlanTool({ plan: "do it" })).toEqual({
      success: false,
      error: expect.stringContaining("Nothing was saved"),
    });
  });
});

describe("planNote", () => {
  it("sends the open plan, with SHIELD's remarks on steps", () => {
    const note = planNote(
      plan({ note: "Total was off by tax" }),
      new Map([[0, "not confirmed"]])
    );
    expect(note).toMatch(/^\[SHIELD: the plan for this session/);
    expect(note).toContain("[x] Read cart.js - not confirmed");
    expect(note).toContain("[>] Fix the total");
    expect(note).toContain("Note: Total was off by tax");
    expect(note.endsWith("]")).toBe(true);
  });

  it("says when the user changed it", () => {
    expect(planNote(plan({ by: "user" }))).toContain(
      "The user changed it since your last update; follow their version."
    );
  });

  it("sends nothing once every step is done, or with no plan", () => {
    expect(planNote(undefined)).toBe("");
    expect(
      planNote(plan({ steps: [{ step: "Done", status: "completed" }] }))
    ).toBe("");
  });
});
