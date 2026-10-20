import { describe, expect, it } from "vitest";
import {
  MAX_ORCHESTRATOR_ROUNDS,
  orchestratorRounds,
  DELEGATE_NEXT_NOTE,
  withDelegateNudge,
  DELEGATE_TOOL,
  formatReport,
  MAX_DELEGATIONS_PER_TURN,
  MAX_TASK_CHARS,
  parseDelegateArgs,
} from "./delegate";
import { TeamRun } from "./team";
import type { AgentReport } from "./types";

describe("parseDelegateArgs", () => {
  it("accepts a role and a task and drops unknown fields", () => {
    expect(
      parseDelegateArgs({
        role: "Coder",
        task: "  fix add.sh  ",
        task_id: "1",
        priority: "high",
      })
    ).toEqual({
      ok: true,
      value: { role: "coder", task: "fix add.sh", continueFrom: undefined },
    });
  });

  it("understands role synonyms and argument aliases", () => {
    expect(parseDelegateArgs({ agent: "QA", prompt: "run it" })).toMatchObject({
      ok: true,
      value: { role: "tester", task: "run it" },
    });
    expect(
      parseDelegateArgs({ role: "critic", description: "look" })
    ).toMatchObject({
      ok: true,
      value: { role: "reviewer" },
    });
  });

  it("refuses an unknown role, listing the real ones", () => {
    const result = parseDelegateArgs({ role: "manager", task: "x" });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("coder, tester, reviewer"),
    });
  });

  it("refuses a missing or empty task and an oversized one", () => {
    expect(parseDelegateArgs({ role: "coder" })).toMatchObject({ ok: false });
    expect(parseDelegateArgs({ role: "coder", task: "   " })).toMatchObject({
      ok: false,
    });
    const long = parseDelegateArgs({
      role: "coder",
      task: "x".repeat(MAX_TASK_CHARS + 1),
    });
    expect(long).toMatchObject({
      ok: false,
      error: expect.stringContaining("limit"),
    });
  });

  it("takes a handoff id for continue_from, and refuses junk instead of passing it on", () => {
    expect(
      parseDelegateArgs({ role: "coder", task: "x", continue_from: "H2" })
    ).toMatchObject({
      ok: true,
      value: { continueFrom: "h2" },
    });
    expect(
      parseDelegateArgs({ role: "coder", task: "x", continueFrom: "h10" })
    ).toMatchObject({
      ok: true,
      value: { continueFrom: "h10" },
    });
    for (const junk of ["1", "latest", 2, "h"]) {
      expect(
        parseDelegateArgs({ role: "coder", task: "x", continue_from: junk })
      ).toMatchObject({
        ok: false,
        error: expect.stringContaining('like "h2"'),
      });
    }
    // empty means "not given"
    expect(
      parseDelegateArgs({ role: "coder", task: "x", continue_from: "" })
    ).toMatchObject({ ok: true });
  });

  it("declares a strict schema the model sees", () => {
    expect(DELEGATE_TOOL.inputSchema.required).toEqual(["role", "task"]);
    expect(DELEGATE_TOOL.inputSchema.additionalProperties).toBe(false);
  });
});

describe("formatReport", () => {
  const base: AgentReport = {
    role: "coder",
    status: "DONE",
    handoffId: "h3",
    summary: "Fixed the sign.",
    parsed: {
      found: true,
      status: "DONE",
      done: "add.sh",
      inProgress: "",
      next: "",
      notes: "",
    },
    work: {
      files: [{ path: "p/add.sh", action: "edited", ok: true }],
      commands: [{ command: "./test.sh", exitCode: 0, suspectLines: 0 }],
      refused: [],
    },
    steps: 3,
    contextPercent: 41,
  };

  it("puts the agent's words and SHIELD's facts side by side, and says which to trust", () => {
    const text = formatReport(base);
    expect(text).toContain("[coder · DONE · 3 steps · context 41%] handoff h3");
    expect(text).toContain("AGENT'S SUMMARY: Fixed the sign.");
    expect(text).toContain(
      "Checked by SHIELD from the tools' real results (trust this over the summary)"
    );
    expect(text).toContain("- files: p/add.sh edited");
    expect(text).toContain("- commands: ./test.sh -> exit 0");
    expect(text).not.toContain("continue_from");
  });

  it("tells the orchestrator how to continue a PARTIAL run", () => {
    const text = formatReport({
      ...base,
      status: "PARTIAL",
      reason: "its context reached 70%",
      parsed: { ...base.parsed, next: "write sub.sh" },
    });
    expect(text).toContain("WHY IT STOPPED: its context reached 70%");
    expect(text).toContain("NEXT: write sub.sh");
    expect(text).toContain('delegate to coder again with continue_from "h3"');
  });

  it("warns the orchestrator when an agent reported nothing", () => {
    const text = formatReport({
      ...base,
      status: "PARTIAL",
      summary: "",
      reason: "it ended without a report",
    });
    expect(text).toContain("WHY IT STOPPED: it ended without a report");
    expect(text).toContain("WARNING: the agent reported nothing");
    expect(formatReport(base)).not.toContain("WARNING");
  });

  it("calls a note on a finished run a note, not a reason it stopped", () => {
    const text = formatReport({
      ...base,
      reason: "it wrote no HANDOFF block, so only its summary is known",
    });
    expect(text).toContain("NOTE: it wrote no HANDOFF block");
    expect(text).not.toContain("WHY IT STOPPED");
  });

  it("cuts a long summary", () => {
    expect(formatReport({ ...base, summary: "x".repeat(5000) })).toContain(
      "... [cut]"
    );
  });
});

describe("TeamRun", () => {
  it("keeps notes short, deduplicated in size, and shows them to new agents", () => {
    const team = new TeamRun();
    expect(team.addNote("   ")).toBe("");
    expect(team.addNote("a\n  b")).toBe("a b");
    team.addNote("x".repeat(500));
    expect(team.getNotes()[1]).toHaveLength(200);
    for (let i = 0; i < 40; i++) team.addNote(`n${i}`);
    expect(team.getNotes()).toHaveLength(30);
    expect(team.notesBlock()).toContain("- n39");
    expect(new TeamRun().notesBlock()).toBe("");
  });

  it("tracks PARTIAL hand-offs nothing has continued, for one role, newest first, within a turn", () => {
    const team = new TeamRun();
    const stored = (
      id: string,
      role: "coder" | "tester",
      status: "PARTIAL" | "DONE",
      finished: boolean
    ) =>
      team.saveHandoff({
        id,
        role,
        task: "t",
        status,
        finished,
        parsed: { found: false, done: "", inProgress: "", next: "", notes: "" },
        work: { files: [], commands: [], refused: [] },
      });
    stored("h1", "coder", "PARTIAL", true);
    stored("h2", "tester", "PARTIAL", true);
    stored("h3", "coder", "PARTIAL", true);
    stored("h4", "coder", "PARTIAL", false); // a run still going, or one that broke
    expect(team.openPartialFor("coder")?.id).toBe("h3");
    expect(team.openPartialFor("tester")?.id).toBe("h2");
    expect(team.openPartialFor("reviewer")).toBeUndefined();

    team.markContinued("h3");
    expect(team.openPartialFor("coder")?.id).toBe("h1");

    // a run that ends DONE is not open
    stored("h2", "tester", "DONE", true);
    expect(team.openPartialFor("tester")).toBeUndefined();

    team.beginTurn();
    expect(team.openPartialFor("coder")).toBeUndefined();
  });

  it("refuses a second plan update with no delegation in between, and allows it again after one", () => {
    const team = new TeamRun();
    expect(team.checkOrchestratorCall("update_plan")).toBeNull();
    expect(team.checkOrchestratorCall("update_plan")).toContain(
      "Your next call must be delegate"
    );
    // still refused until the orchestrator delegates
    expect(team.checkOrchestratorCall("update_plan")).not.toBeNull();
    expect(team.checkOrchestratorCall("delegate")).toBeNull();
    expect(team.checkOrchestratorCall("update_plan")).toBeNull();
    team.beginTurn();
    expect(team.checkOrchestratorCall("update_plan")).toBeNull();
    expect(team.checkOrchestratorCall("delegate")).toBeNull();
    expect(team.checkOrchestratorCall("delegate")).toBeNull();
  });

  it("limits delegations per turn and resets on the next user message", () => {
    const team = new TeamRun();
    for (let i = 0; i < MAX_DELEGATIONS_PER_TURN; i++) {
      expect(team.countDelegation(MAX_DELEGATIONS_PER_TURN)).toBe(true);
    }
    expect(team.countDelegation(MAX_DELEGATIONS_PER_TURN)).toBe(false);
    team.beginTurn();
    expect(team.countDelegation(MAX_DELEGATIONS_PER_TURN)).toBe(true);
  });
});

describe("withDelegateNudge", () => {
  it("adds the instruction to a saved plan, keeping what was there", () => {
    const saved = {
      success: true,
      data: { content: [{ type: "text", text: "Plan saved\n[>] Fix it" }] },
    };
    const nudged = withDelegateNudge(saved) as typeof saved;
    expect(nudged.data.content.map((part) => part.text)).toEqual([
      "Plan saved\n[>] Fix it",
      DELEGATE_NEXT_NOTE,
    ]);
    expect(DELEGATE_NEXT_NOTE).toContain("your next call must be delegate");
  });

  it("leaves a failed plan call alone, and copes with a result that has no content", () => {
    const failed = { success: false, error: "update_plan needs plan" };
    expect(withDelegateNudge(failed)).toBe(failed);
    expect(withDelegateNudge({ success: true })).toMatchObject({
      data: { content: [{ text: DELEGATE_NEXT_NOTE }] },
    });
  });
});

describe("orchestratorRounds", () => {
  it("caps the orchestrator below the general limit, never raising a lower one", () => {
    expect(MAX_ORCHESTRATOR_ROUNDS).toBe(12);
    expect(orchestratorRounds(20)).toBe(12);
    expect(orchestratorRounds(50)).toBe(12);
    expect(orchestratorRounds(8)).toBe(8);
    expect(orchestratorRounds(undefined)).toBe(12);
  });
});
