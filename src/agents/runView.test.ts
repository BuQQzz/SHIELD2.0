import { describe, expect, it } from "vitest";
import {
  appendLiveText,
  applyAgentEvent,
  latestRun,
  type AgentRunView,
} from "./runView";
import type { AgentEvent } from "./events";

const run = (events: AgentEvent[], from: AgentRunView[] = []) =>
  events.reduce(
    (runs, event, i) => applyAgentEvent(runs, event, 1000 + i),
    from
  );

const start: AgentEvent = {
  type: "start",
  runId: "h1",
  role: "coder",
  task: "fix it",
};

describe("applyAgentEvent", () => {
  it("builds the story of a run in order", () => {
    const [view] = run([
      start,
      { type: "session", runId: "h1", sessionId: "agent-1" },
      { type: "reply", runId: "h1", text: "Let me look." },
      {
        type: "tool",
        runId: "h1",
        callId: "h1-1",
        tool: "read_text_file",
        target: "/p/a.js",
      },
      {
        type: "result",
        runId: "h1",
        callId: "h1-1",
        ok: true,
        refused: false,
        text: "const a = 1",
      },
      { type: "context", runId: "h1", percent: 22 },
      {
        type: "end",
        runId: "h1",
        status: "DONE",
        summary: "Fixed.",
        workLines: ["- files: a.js edited"],
        steps: 1,
        contextPercent: 25,
      },
    ]);
    expect(view).toMatchObject({
      id: "h1",
      role: "coder",
      task: "fix it",
      status: "DONE",
      sessionId: "agent-1",
      contextPercent: 25,
      summary: "Fixed.",
      workLines: ["- files: a.js edited"],
      startedAt: 1000,
      endedAt: 1006,
    });
    expect(view!.steps).toEqual([
      { kind: "say", id: "h1-say-0", text: "Let me look." },
      {
        kind: "tool",
        id: "h1-1",
        tool: "read_text_file",
        target: "/p/a.js",
        state: "ok",
        text: "const a = 1",
      },
    ]);
  });

  it("shows a tool as running until its result arrives, and a refusal as refused", () => {
    const mid = run([
      start,
      {
        type: "tool",
        runId: "h1",
        callId: "h1-1",
        tool: "edit_file",
        target: "/p/a.js",
      },
    ]);
    expect(mid[0]!.steps[0]).toMatchObject({ state: "running" });
    const refused = run(
      [
        {
          type: "result",
          runId: "h1",
          callId: "h1-1",
          ok: false,
          refused: true,
          text: "Not run: tester may not",
        },
      ],
      mid
    );
    expect(refused[0]!.steps[0]).toMatchObject({
      state: "refused",
      text: "Not run: tester may not",
    });
    const failed = run(
      [
        {
          type: "result",
          runId: "h1",
          callId: "h1-1",
          ok: false,
          refused: false,
          text: "no match",
        },
      ],
      mid
    );
    expect(failed[0]!.steps[0]).toMatchObject({ state: "failed" });
  });

  it("does not leave a tool running after the run ends", () => {
    const [view] = run([
      start,
      {
        type: "tool",
        runId: "h1",
        callId: "h1-1",
        tool: "run_command",
        target: "npm test",
      },
      {
        type: "end",
        runId: "h1",
        status: "FAILED",
        summary: "",
        reason: "the run broke",
        workLines: [],
        steps: 1,
        contextPercent: 0,
      },
    ]);
    expect(view!.steps[0]).toMatchObject({ state: "failed" });
    expect(view!.status).toBe("FAILED");
  });

  it("marks the checkpoint and keeps the continued hand-off", () => {
    const [view] = run([
      { ...start, continuesFrom: "h0" },
      { type: "checkpoint", runId: "h1", percent: 71 },
    ]);
    expect(view).toMatchObject({
      checkpointed: true,
      contextPercent: 71,
      continuesFrom: "h0",
    });
  });

  it("ignores a replayed start and events for runs it does not know", () => {
    const once = run([start]);
    expect(run([start], once)).toHaveLength(1);
    expect(
      run([{ type: "context", runId: "nope", percent: 5 }], once)[0]!
        .contextPercent
    ).toBe(0);
  });
});

describe("appendLiveText", () => {
  const working = run([
    start,
    { type: "session", runId: "h1", sessionId: "agent-1" },
  ]);

  it("adds streamed text to the agent that owns the session, until its reply ends", () => {
    let runs = appendLiveText(working, "agent-1", "Hel");
    runs = appendLiveText(runs, "agent-1", "lo");
    expect(runs[0]!.live).toBe("Hello");
    runs = applyAgentEvent(runs, { type: "reply", runId: "h1", text: "Hello" });
    expect(runs[0]!.live).toBe("");
  });

  it("leaves other sessions and finished runs alone, returning the same array", () => {
    expect(appendLiveText(working, "agent-9", "x")).toBe(working);
    const done = applyAgentEvent(working, {
      type: "end",
      runId: "h1",
      status: "DONE",
      summary: "",
      workLines: [],
      steps: 0,
      contextPercent: 0,
    });
    expect(appendLiveText(done, "agent-1", "late")).toBe(done);
  });
});

describe("latestRun", () => {
  it("prefers the newest run still working, else the newest", () => {
    const runs = run([
      start,
      { type: "start", runId: "h2", role: "tester", task: "t" },
      { type: "start", runId: "h3", role: "reviewer", task: "r" },
      {
        type: "end",
        runId: "h3",
        status: "DONE",
        summary: "",
        workLines: [],
        steps: 0,
        contextPercent: 0,
      },
    ]);
    expect(latestRun(runs)?.id).toBe("h2");
    const allDone = applyAgentEvent(runs, {
      type: "end",
      runId: "h2",
      status: "DONE",
      summary: "",
      workLines: [],
      steps: 0,
      contextPercent: 0,
    });
    const finished = applyAgentEvent(allDone, {
      type: "end",
      runId: "h1",
      status: "PARTIAL",
      summary: "",
      workLines: [],
      steps: 0,
      contextPercent: 0,
    });
    expect(latestRun(finished)?.id).toBe("h3");
    expect(latestRun([])).toBeUndefined();
  });
});
