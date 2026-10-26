import { describe, expect, it } from "vitest";
import { planStepsFromRuns, stepTask } from "./teamPlan";
import { applyAgentEvent, type AgentRunView } from "./runView";
import type { AgentEvent } from "./events";

const runs = (events: AgentEvent[]): AgentRunView[] =>
  events.reduce<AgentRunView[]>((all, e) => applyAgentEvent(all, e), []);
const start = (
  runId: string,
  role: "coder" | "tester" | "reviewer",
  task: string
): AgentEvent => ({ type: "start", runId, role, task });
const end = (
  runId: string,
  status: "DONE" | "PARTIAL" | "BLOCKED" | "FAILED"
): AgentEvent => ({
  type: "end",
  runId,
  status,
  summary: "",
  workLines: [],
  steps: 0,
  contextPercent: 0,
});

describe("stepTask", () => {
  it("takes the first sentence, on one line", () => {
    expect(
      stepTask("Read test_calc.py and find the bug.\nThen report what you saw.")
    ).toBe("Read test_calc.py and find the bug.");
    expect(stepTask("  Run   the tests  ")).toBe("Run the tests");
  });
  it("shows a path as its last two segments, as a checklist line has no room for the rest", () => {
    expect(
      stepTask(
        "Read the file '/home/buqqzz/Desktop/Projects/SHIELD2.0/tmp/ui-check/team-project/test_calc.py' and find the bug."
      )
    ).toBe("Read the file 'team-project/test_calc.py' and find the bug.");
    expect(stepTask("Review C:\\Users\\me\\app\\src\\calc.py now.")).toBe(
      "Review src/calc.py now."
    );
    expect(stepTask("Edit src/calc.py and tests/a.py")).toBe(
      "Edit src/calc.py and tests/a.py"
    );
  });

  it("cuts a long sentence", () => {
    const text = stepTask("x".repeat(300));
    expect(text.length).toBeLessThanOrEqual(90);
    expect(text.endsWith("...")).toBe(true);
  });
});

describe("planStepsFromRuns", () => {
  it("makes one step per delegation: working is in progress, DONE is completed", () => {
    const steps = planStepsFromRuns(
      runs([
        start("h1", "coder", "Fix the bug in calc.py. It subtracts."),
        end("h1", "DONE"),
        start("h2", "tester", "Run python3 test_calc.py"),
      ])
    );
    expect(steps).toEqual([
      { step: "Coder: Fix the bug in calc.py.", status: "completed" },
      { step: "Tester: Run python3 test_calc.py", status: "in_progress" },
    ]);
  });

  it("leaves a run that did not finish pending, so it reads as still to do", () => {
    const steps = planStepsFromRuns(
      runs([
        start("h1", "coder", "A"),
        end("h1", "PARTIAL"),
        start("h2", "tester", "B"),
        end("h2", "BLOCKED"),
        start("h3", "reviewer", "C"),
        end("h3", "FAILED"),
      ])
    );
    expect(steps.map((s) => s.status)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("has no steps before anything is delegated, and keeps the latest 12", () => {
    expect(planStepsFromRuns([])).toEqual([]);
    const many = runs(
      Array.from({ length: 15 }, (_, i) => start(`h${i}`, "coder", `Task ${i}`))
    );
    const steps = planStepsFromRuns(many);
    expect(steps).toHaveLength(12);
    expect(steps[0]?.step).toBe("Coder: Task 3");
  });
});
