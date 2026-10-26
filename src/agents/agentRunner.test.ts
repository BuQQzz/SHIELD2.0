import { describe, expect, it, vi } from "vitest";
import { runAgent, type AgentRunDeps } from "./agentRunner";
import { TeamRun } from "./team";
import type { AgentEvent } from "./events";
import type { MCPToolResult } from "../types/electron";

const call = (
  tool: string,
  args: Record<string, unknown>,
  server = "filesystem"
) =>
  `<tool_call>\n<server>${server}</server>\n<tool>${tool}</tool>\n<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`;

const ok = (text: string): MCPToolResult => ({
  success: true,
  data: { content: [{ type: "text", text }] },
});

const HANDOFF_DONE =
  "HANDOFF\nSTATUS: DONE\nDONE: changed add.sh\nNEXT: nothing\nNOTES: none";

/** A fake model that answers with the next scripted reply, and a fake tool layer */
function harness(
  replies: string[],
  options: {
    used?: (turn: number) => number;
    size?: number;
    execute?: AgentRunDeps["execute"];
    isStopped?: () => boolean;
    openSession?: AgentRunDeps["openSession"];
  } = {}
) {
  const sent: string[] = [];
  const thinking: (boolean | undefined)[] = [];
  const executed: string[] = [];
  let turn = 0;
  const deps: AgentRunDeps = {
    openSession: options.openSession ?? (async () => "s1"),
    chat: async (_id, message, chatOptions) => {
      sent.push(message);
      thinking.push(chatOptions?.thinking);
      const reply = replies[Math.min(turn, replies.length - 1)] ?? "";
      turn += 1;
      return reply;
    },
    contextOf: async () => ({
      used: options.used?.(turn) ?? 1000,
      size: options.size ?? 32768,
    }),
    closeSession: vi.fn(async () => {}),
    execute:
      options.execute ??
      (async (c) => {
        executed.push(`${c.tool} ${JSON.stringify(c.arguments)}`);
        return ok(
          c.tool === "run_command" ? "Exit code 0 · 0.1 s\nPASS" : "done"
        );
      }),
    buildPrompt: (spec) => `PROMPT for ${spec.role}`,
    isStopped: options.isStopped,
  };
  return { deps, sent, thinking, executed };
}

describe("runAgent", () => {
  // The permission bar names the agent that is asking (2026-10-22)
  it("tells the app which role makes each call", async () => {
    const roles: (string | undefined)[] = [];
    const { deps } = harness(
      [
        call("read_text_file", { path: "/p/a.sh" }),
        `Looked.\n\n${HANDOFF_DONE}`,
      ],
      {
        execute: async (_call, context) => {
          roles.push(context?.role);
          return ok("done");
        },
      }
    );
    await runAgent({ role: "reviewer", task: "t", team: new TeamRun() }, deps);
    expect(roles).toEqual(["reviewer"]);
  });

  it("runs a task through the tool loop and reports what SHIELD saw", async () => {
    const { deps, sent, executed } = harness([
      call("edit_file", {
        path: "/p/add.sh",
        edits: [{ oldText: "-", newText: "+" }],
      }),
      call(
        "run_command",
        { command: "./test.sh", reason: "check" },
        "terminal"
      ),
      `Fixed and checked.\n\n${HANDOFF_DONE}`,
    ]);
    const team = new TeamRun();

    const report = await runAgent(
      { role: "coder", task: "fix add.sh", team },
      deps
    );

    expect(report.status).toBe("DONE");
    expect(report.summary).toBe("Fixed and checked.");
    expect(report.parsed.done).toBe("changed add.sh");
    expect(report.steps).toBe(2);
    expect(report.work.files).toEqual([
      { path: "p/add.sh", action: "edited", ok: true },
    ]);
    expect(report.work.commands).toEqual([
      { command: "./test.sh", exitCode: 0, suspectLines: 0 },
    ]);
    expect(executed).toHaveLength(2);
    // the session got the task first, and a context meter after each result
    expect(sent[0]).toContain("TASK:\nfix add.sh");
    expect(sent[1]).toMatch(/\[Context: \d+% used\]$/);
    expect(deps.closeSession).toHaveBeenCalledWith("s1");
    expect(team.getHandoff(report.handoffId)?.status).toBe("DONE");
  });

  it("refuses what the role may not do, and says so, without running it", async () => {
    const { deps, sent, executed } = harness([
      call("edit_file", { path: "/p/add.sh", edits: [] }),
      `I could not edit the source.\n\n${HANDOFF_DONE}`,
    ]);

    const report = await runAgent(
      { role: "tester", task: "test add.sh", team: new TeamRun() },
      deps
    );

    expect(executed).toEqual([]);
    expect(sent[1]).toContain(
      "Not run: The tester may only create or change test files"
    );
    expect(report.work.refused).toEqual(["tester edit_file p/add.sh"]);
    expect(report.work.files).toEqual([]);
  });

  it("lets the tester write a test file", async () => {
    const { deps, executed } = harness([
      call("write_file", { path: "/p/test_add.sh", content: "x" }),
      HANDOFF_DONE,
    ]);
    const report = await runAgent(
      { role: "tester", task: "t", team: new TeamRun() },
      deps
    );
    expect(executed).toHaveLength(1);
    expect(report.work.files[0]).toMatchObject({
      path: "p/test_add.sh",
      action: "written",
      ok: true,
    });
  });

  it("caps commands per role", async () => {
    const replies = Array.from({ length: 9 }, (_, i) =>
      call(
        "run_command",
        { command: `npm test -- run${i}`, reason: "x" },
        "terminal"
      )
    );
    const { deps, executed, sent } = harness([...replies, HANDOFF_DONE]);

    const report = await runAgent(
      { role: "tester", task: "t", team: new TeamRun() },
      deps
    );

    expect(executed).toHaveLength(6); // the tester's limit
    expect(sent.join("\n")).toContain(
      "you have run 6 commands, the most a tester may"
    );
    expect(
      report.work.refused.some((r) => r.includes("over the limit of 6"))
    ).toBe(true);
  });

  it("records exit codes and output that looked like failures", async () => {
    const { deps } = harness(
      [
        call("run_command", { command: "./t.sh", reason: "x" }, "terminal"),
        call("run_command", { command: "./u.sh", reason: "x" }, "terminal"),
        HANDOFF_DONE,
      ],
      {
        execute: vi
          .fn()
          .mockResolvedValueOnce(ok("Exit code 1 · 0.0 s\nFAIL add"))
          .mockResolvedValueOnce(
            ok(
              "Exit code 0 · 0.0 s\n✗ x\n\n[Exit code 0, but 2 lines of the output look like failures. Fix them]"
            )
          ),
      }
    );

    const report = await runAgent(
      { role: "coder", task: "t", team: new TeamRun() },
      deps
    );

    expect(report.work.commands).toEqual([
      { command: "./t.sh", exitCode: 1, suspectLines: 0 },
      { command: "./u.sh", exitCode: 0, suspectLines: 2 },
    ]);
  });

  it("marks a failed edit as not ok", async () => {
    const { deps } = harness(
      [call("edit_file", { path: "/p/a.js", edits: [] }), HANDOFF_DONE],
      { execute: async () => ({ success: false, error: "no exact match" }) }
    );
    const report = await runAgent(
      { role: "coder", task: "t", team: new TeamRun() },
      deps
    );
    expect(report.work.files).toEqual([
      { path: "p/a.js", action: "edited", ok: false },
    ]);
  });

  it("stops at the checkpoint, asks for the hand-off, and reports PARTIAL", async () => {
    const { deps, sent, thinking, executed } = harness(
      [
        call("read_text_file", { path: "/p/a.js" }),
        // told to stop, it keeps calling tools twice
        call("read_text_file", { path: "/p/b.js" }),
        call("read_text_file", { path: "/p/c.js" }),
        "HANDOFF\nSTATUS: PARTIAL\nDONE: read a.js\nNEXT: read b.js and c.js, then fix the bug",
      ],
      { used: () => 24000, size: 32768 } // 73%
    );

    const report = await runAgent(
      { role: "coder", task: "t", team: new TeamRun() },
      deps
    );

    expect(sent[1]).toMatch(/\[Context: 7\d% used\]/);
    expect(sent[1]).toContain("Stop working now");
    expect(executed).toHaveLength(1); // only the read before the checkpoint ran
    expect(sent.at(-1)).toContain("stop here. Do not call any tool");
    // the report request alone is sent without thought
    expect(thinking.at(-1)).toBe(false);
    expect(thinking.slice(0, -1).every((t) => t === undefined)).toBe(true);
    expect(report.status).toBe("PARTIAL");
    expect(report.reason).toBe("its context reached 70%");
    expect(report.parsed.next).toBe("read b.js and c.js, then fix the bug");
  });

  // Seen live (2026-10-20): a reviewer ended on <server>filesystem</tool>, which
  // parses as plain text, so it "finished" with no findings, and the
  // orchestrator told the user the review had confirmed everything was correct.
  // Now the call is answered with what was wrong, and the agent goes on.
  it("tells an agent its tool call had no tool name, and it carries on to a report", async () => {
    const malformed =
      '<tool_call>\n<server>filesystem</tool>\n<arguments>{"path":"/p/test.sh"}</arguments>\n</tool_call>';
    const { deps, sent } = harness([
      call("read_text_file", { path: "/p/a.sh" }),
      malformed,
      "One problem: test_negative.sh line 2 has mangled quotes in cd.\n\nHANDOFF\nSTATUS: DONE\nDONE: reviewed both files\nNOTES: the cd line fails",
    ]);

    const report = await runAgent(
      { role: "reviewer", task: "review", team: new TeamRun() },
      deps
    );

    expect(sent.at(-1)).toContain("no <tool> element");
    expect(report.status).toBe("DONE");
    expect(report.summary).toBe(
      "One problem: test_negative.sh line 2 has mangled quotes in cd."
    );
    expect(report.parsed.notes).toBe("the cd line fails");
    expect(report.reason).toBeUndefined();
  });

  // Live: a thinking model spent its whole reply on thought and said nothing
  it("asks once more, shorter, when the report request gets an empty reply", async () => {
    const { deps, sent } = harness([
      call("read_text_file", { path: "/p/a.js" }),
      "",
      "",
      "Ran it, exit 0.\n\nHANDOFF\nSTATUS: DONE\nDONE: ran the tests",
    ]);
    const report = await runAgent(
      { role: "tester", task: "t", team: new TeamRun() },
      deps
    );
    expect(sent.at(-1)).toContain("your last reply was empty");
    expect(report.status).toBe("DONE");
    expect(report.summary).toBe("Ran it, exit 0.");
  });

  it("keeps what an agent said in prose when it never writes the block, and says so", async () => {
    const { deps } = harness(["Looks fine to me, no issues."]);
    const report = await runAgent(
      { role: "reviewer", task: "review", team: new TeamRun() },
      deps
    );
    expect(report.status).toBe("DONE");
    expect(report.summary).toBe("Looks fine to me, no issues.");
    expect(report.parsed.found).toBe(false);
    expect(report.reason).toContain("wrote no HANDOFF block");
  });

  it("never reports DONE for an agent that said nothing", async () => {
    const { deps } = harness([""]);
    const report = await runAgent(
      { role: "reviewer", task: "review", team: new TeamRun() },
      deps
    );
    expect(report.status).toBe("PARTIAL");
    expect(report.summary).toBe("");
    expect(report.reason).toBe("it ended without a report");
  });

  it("hands over at a different threshold when the caller sets one", async () => {
    const { deps, sent } = harness(
      [
        call("read_text_file", { path: "/p/a.js" }),
        "HANDOFF\nSTATUS: PARTIAL\nNEXT: carry on",
      ],
      { used: () => 9000, size: 32768 } // ~28%
    );
    deps.checkpointAt = 0.25;
    const report = await runAgent(
      { role: "coder", task: "t", team: new TeamRun() },
      deps
    );
    expect(sent[1]).toContain("your context is 25% full");
    expect(report.reason).toBe("its context reached 25%");
    expect(report.status).toBe("PARTIAL");
  });

  it("reports PARTIAL when it runs out of steps while still working", async () => {
    // a different file each time, so no call repeats
    const replies = Array.from({ length: 40 }, (_, i) =>
      call("read_text_file", { path: `/p/f${i}.js` })
    );
    const { deps, sent } = harness([...replies.slice(0, 40)]);
    // the final HANDOFF_REQUEST reply is also a tool call; the parse then finds no block
    const report = await runAgent(
      { role: "reviewer", task: "t", team: new TeamRun() },
      deps
    );

    expect(report.status).toBe("PARTIAL");
    expect(report.reason).toBe("it used all 12 steps it is allowed");
    expect(sent.at(-1)).toContain("stop here");
    expect(report.parsed.found).toBe(false);
  });

  it("accepts a finished agent even after the checkpoint notice", async () => {
    const { deps } = harness(
      [call("read_text_file", { path: "/p/a.js" }), HANDOFF_DONE],
      { used: () => 25000 }
    );
    const report = await runAgent(
      { role: "reviewer", task: "t", team: new TeamRun() },
      deps
    );
    expect(report.status).toBe("DONE");
    expect(report.reason).toBeUndefined();
  });

  it("keeps a hand-off from the first step, so a run whose model dies can be continued", async () => {
    const team = new TeamRun();
    let turn = 0;
    const { deps } = harness([
      call("write_file", { path: "/p/a.js", content: "x" }),
    ]);
    deps.chat = async () => {
      turn += 1;
      if (turn === 1)
        return call("write_file", { path: "/p/a.js", content: "x" });
      throw new Error("llama-server exited");
    };

    const report = await runAgent(
      { role: "coder", task: "build it", team },
      deps
    );

    expect(report.status).toBe("FAILED");
    expect(report.reason).toContain("llama-server exited");
    // what the agent did before the model died is still known
    const stored = team.getHandoff(report.handoffId);
    expect(stored?.status).toBe("PARTIAL");
    expect(stored?.work.files).toEqual([
      { path: "p/a.js", action: "written", ok: true },
    ]);
    expect(report.work.files).toHaveLength(1);
    expect(deps.closeSession).toHaveBeenCalled();
  });

  it("feeds a tool that throws back to the agent as an error and carries on", async () => {
    const { deps, sent } = harness(
      [call("read_text_file", { path: "/p/a.js" }), HANDOFF_DONE],
      {
        execute: async () => {
          throw new Error("tool layer crashed");
        },
      }
    );
    const report = await runAgent(
      { role: "coder", task: "t", team: new TeamRun() },
      deps
    );
    expect(sent[1]).toContain("tool layer crashed");
    expect(report.status).toBe("DONE");
  });

  it("reports FAILED, with the reason, when no session can be opened", async () => {
    const { deps } = harness([], {
      openSession: async () => {
        throw new Error("Agent teams need a model that runs on llama-server");
      },
    });
    const report = await runAgent(
      { role: "coder", task: "t", team: new TeamRun() },
      deps
    );
    expect(report.status).toBe("FAILED");
    expect(report.reason).toContain("llama-server");
    expect(deps.closeSession).not.toHaveBeenCalled();
  });

  it("ends the run PARTIAL when the user stops it", async () => {
    let stopped = false;
    const { deps } = harness(
      [
        call("read_text_file", { path: "/p/a.js" }),
        call("read_text_file", { path: "/p/b.js" }),
      ],
      {
        isStopped: () => stopped,
        execute: async () => {
          stopped = true;
          return ok("done");
        },
      }
    );
    const report = await runAgent(
      { role: "coder", task: "t", team: new TeamRun() },
      deps
    );
    expect(report.status).toBe("PARTIAL");
    expect(report.reason).toBe("the user stopped it");
  });

  it("seeds a fresh agent with the earlier hand-off and the team notes, not the old chat", async () => {
    const team = new TeamRun();
    team.addNote("run tests with ./test.sh");
    const earlier = {
      id: "h1",
      role: "coder" as const,
      task: "old task",
      status: "PARTIAL" as const,
      parsed: {
        found: true,
        status: "PARTIAL" as const,
        done: "add.sh",
        inProgress: "",
        next: "write sub.sh",
        notes: "",
      },
      work: {
        files: [{ path: "p/add.sh", action: "written" as const, ok: true }],
        commands: [],
        refused: [],
      },
    };
    team.saveHandoff(earlier);
    const { deps, sent } = harness([HANDOFF_DONE]);

    await runAgent(
      { role: "coder", task: "finish the job", team, continueFrom: earlier },
      deps
    );

    expect(sent[0]).toContain("TASK:\nfinish the job");
    expect(sent[0]).toContain("previous coder stopped with status PARTIAL");
    expect(sent[0]).toContain("NEXT: write sub.sh");
    expect(sent[0]).toContain("- files: p/add.sh written");
    expect(sent[0]).toContain("- run tests with ./test.sh");
    expect(sent[0]).not.toContain("old task");
  });

  it("lets agents leave team notes without touching the tools", async () => {
    const team = new TeamRun();
    const { deps, executed } = harness([
      call("add_team_note", { text: "the repo uses bash 5" }, "agents"),
      HANDOFF_DONE,
    ]);
    await runAgent({ role: "coder", task: "t", team }, deps);
    expect(executed).toEqual([]);
    expect(team.getNotes()).toEqual(["the repo uses bash 5"]);
  });

  it("numbers hand-offs per team", async () => {
    const team = new TeamRun();
    const a = await runAgent(
      { role: "coder", task: "a", team },
      harness([HANDOFF_DONE]).deps
    );
    const b = await runAgent(
      { role: "tester", task: "b", team },
      harness([HANDOFF_DONE]).deps
    );
    expect([a.handoffId, b.handoffId]).toEqual(["h1", "h2"]);
  });

  describe("events for the Team panel", () => {
    const withEvents = (
      replies: string[],
      options: Parameters<typeof harness>[1] = {}
    ) => {
      const h = harness(replies, options);
      const events: AgentEvent[] = [];
      h.deps.onEvent = (event) => events.push(event);
      return { ...h, events };
    };

    it("reports a run from start to end: session, what the agent said, each tool and its result", async () => {
      const { deps, events } = withEvents([
        `Let me look.\n${call("read_text_file", { path: "/p/a.js" })}`,
        call("run_command", { command: "./test.sh", reason: "x" }, "terminal"),
        `All good.\n\n${HANDOFF_DONE}`,
      ]);
      const report = await runAgent(
        { role: "coder", task: "fix it", team: new TeamRun() },
        deps
      );

      expect(events.map((e) => e.type)).toEqual([
        "start",
        "session",
        "reply",
        "tool",
        "result",
        "context",
        "tool",
        "result",
        "context",
        "reply",
        "end",
      ]);
      expect(events[0]).toMatchObject({
        type: "start",
        runId: report.handoffId,
        role: "coder",
        task: "fix it",
      });
      expect(events[1]).toMatchObject({ type: "session", sessionId: "s1" });
      // the agent's words, with the tool-call markup left out
      expect(events[2]).toMatchObject({ type: "reply", text: "Let me look." });
      expect(events[3]).toMatchObject({
        type: "tool",
        tool: "read_text_file",
        target: "/p/a.js",
        callId: `${report.handoffId}-1`,
      });
      expect(events[4]).toMatchObject({
        type: "result",
        callId: `${report.handoffId}-1`,
        ok: true,
        refused: false,
      });
      expect(events[6]).toMatchObject({
        type: "tool",
        tool: "run_command",
        target: "./test.sh",
      });
      expect(events.at(-1)).toMatchObject({
        type: "end",
        status: "DONE",
        summary: "All good.",
        steps: 2,
        workLines: expect.arrayContaining(["- commands: ./test.sh -> exit 0"]),
      });
    });

    it("marks a call SHIELD refused, and says why", async () => {
      const { deps, events } = withEvents([
        call("edit_file", { path: "/p/add.sh", edits: [] }),
        HANDOFF_DONE,
      ]);
      await runAgent({ role: "tester", task: "t", team: new TeamRun() }, deps);
      const result = events.find((e) => e.type === "result");
      expect(result).toMatchObject({ ok: false, refused: true });
      expect((result as { text: string }).text).toContain(
        "only create or change test files"
      );
    });

    it("marks a call the user denied as refused, and records it", async () => {
      // The user denied a coder's list_directory in Ask mode; the panel
      // showed it as failed (2026-10-24)
      const { deps, events } = withEvents(
        [call("list_directory", { path: "/p" }), HANDOFF_DONE],
        {
          execute: async () => ({
            success: false,
            error: "User denied permission",
          }),
        }
      );
      const report = await runAgent(
        { role: "coder", task: "t", team: new TeamRun() },
        deps
      );
      expect(events.find((e) => e.type === "result")).toMatchObject({
        ok: false,
        refused: true,
      });
      expect(report.work.refused).toEqual([
        "coder list_directory /p (denied by the user)",
      ]);
    });

    it("reports the checkpoint and the context as it grows", async () => {
      const { deps, events } = withEvents(
        [
          call("read_text_file", { path: "/p/a.js" }),
          "HANDOFF\nSTATUS: PARTIAL\nNEXT: more",
        ],
        { used: () => 24000 }
      );
      await runAgent({ role: "coder", task: "t", team: new TeamRun() }, deps);
      expect(events.find((e) => e.type === "context")).toMatchObject({
        percent: expect.any(Number),
      });
      expect(events.find((e) => e.type === "checkpoint")).toBeDefined();
      expect(events.at(-1)).toMatchObject({ type: "end", status: "PARTIAL" });
    });

    it("ends the run's story even when the session cannot open", async () => {
      const { deps, events } = withEvents([], {
        openSession: async () => {
          throw new Error("no llama-server");
        },
      });
      await runAgent({ role: "coder", task: "t", team: new TeamRun() }, deps);
      expect(events.map((e) => e.type)).toEqual(["start", "end"]);
      expect(events[1]).toMatchObject({
        status: "FAILED",
        reason: "no llama-server",
      });
    });

    it("names the hand-off a continued run starts from", async () => {
      const team = new TeamRun();
      const earlier = {
        id: "h1",
        role: "coder" as const,
        task: "old",
        status: "PARTIAL" as const,
        finished: true,
        parsed: { found: false, done: "", inProgress: "", next: "", notes: "" },
        work: { files: [], commands: [], refused: [] },
      };
      team.saveHandoff(earlier);
      const { deps, events } = withEvents([HANDOFF_DONE]);
      await runAgent(
        { role: "coder", task: "go on", team, continueFrom: earlier },
        deps
      );
      expect(events[0]).toMatchObject({ type: "start", continuesFrom: "h1" });
    });

    it("is not disturbed by a listener that throws", async () => {
      const { deps } = withEvents([HANDOFF_DONE]);
      deps.onEvent = () => {
        throw new Error("render failed");
      };
      const report = await runAgent(
        { role: "coder", task: "t", team: new TeamRun() },
        deps
      );
      expect(report.status).toBe("DONE");
    });
  });
});
