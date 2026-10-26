import { describe, expect, it, vi } from "vitest";
import { handleDelegate } from "./delegation";
import { TeamRun } from "./team";
import { MAX_DELEGATIONS_PER_TURN } from "./delegate";
import type { AgentRunDeps } from "./agentRunner";

const finish = "All done.\n\nHANDOFF\nSTATUS: DONE\nDONE: it\nNEXT: nothing";

function deps(
  reply = finish
): AgentRunDeps & { chat: ReturnType<typeof vi.fn> } {
  return {
    openSession: async () => "s",
    chat: vi.fn(async () => reply),
    contextOf: async () => ({ used: 500, size: 32768 }),
    closeSession: async () => {},
    execute: async () => ({ success: true, data: "ok" }),
    buildPrompt: (spec) => spec.prompt,
  };
}

const text = (r: Awaited<ReturnType<typeof handleDelegate>>) =>
  r.success
    ? (r.data as { content: { text: string }[] }).content[0]!.text
    : (r.error ?? "");

describe("handleDelegate", () => {
  it("runs the agent and answers with its report", async () => {
    const result = await handleDelegate(
      { role: "coder", task: "look at it" },
      new TeamRun(),
      deps()
    );
    expect(result.success).toBe(true);
    expect(result.changed).toBe(false);
    expect(text(result)).toContain("[coder · DONE");
    expect(text(result)).toContain("AGENT'S SUMMARY: All done.");
    expect(text(result)).toContain("Checked by SHIELD");
  });

  // delegate counts as read-only, so the tool loop needs this to know that
  // what the turn found earlier may no longer hold
  it("says when the agent changed a file or ran a command", async () => {
    const edit =
      '<tool_call>\n<server>filesystem</server>\n<tool>write_file</tool>\n<arguments>{"path":"/p/a.py","content":"x"}</arguments>\n</tool_call>';
    const d = deps();
    d.chat.mockResolvedValueOnce(edit);
    const result = await handleDelegate(
      { role: "coder", task: "write a.py" },
      new TeamRun(),
      d
    );
    expect(text(result)).toContain("[coder · DONE");
    expect(result.changed).toBe(true);
  });

  it("refuses bad arguments with what a good call looks like, and runs nothing", async () => {
    const d = deps();
    const result = await handleDelegate(
      { role: "wizard", task: "x" },
      new TeamRun(),
      d
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("coder, tester, reviewer"),
    });
    expect(d.chat).not.toHaveBeenCalled();
  });

  it("continues from a stored hand-off, and refuses an id that does not exist", async () => {
    const team = new TeamRun();
    const first = deps("HANDOFF\nSTATUS: PARTIAL\nDONE: a\nNEXT: b");
    const one = await handleDelegate(
      { role: "coder", task: "start" },
      team,
      first
    );
    expect(text(one)).toContain("[coder · PARTIAL");

    const second = deps();
    const cont = await handleDelegate(
      { role: "coder", task: "go on", continue_from: "h1" },
      team,
      second
    );
    expect(cont.success).toBe(true);
    expect(second.chat.mock.calls[0]?.[1]).toContain("previous coder stopped");

    const missing = await handleDelegate(
      { role: "coder", task: "x", continue_from: "h9" },
      team,
      deps()
    );
    expect(missing).toMatchObject({
      success: false,
      error: expect.stringContaining('no handoff "h9"'),
    });
  });

  // Live (2026-10-20): the orchestrator re-delegated after a PARTIAL report
  // with its own summary in the task and no continue_from
  it("hands a fresh agent of the same role the open PARTIAL hand-off, though the model forgot continue_from", async () => {
    const team = new TeamRun();
    const first = deps(
      "Read both files.\n\nHANDOFF\nSTATUS: PARTIAL\nDONE: read calc.py\nNEXT: change the minus to a plus"
    );
    await handleDelegate({ role: "coder", task: "find the bug" }, team, first);

    const second = deps();
    const result = await handleDelegate(
      { role: "coder", task: "carry on with calc.py line 2" },
      team,
      second
    );

    expect(second.chat.mock.calls[0]?.[1]).toContain(
      "previous coder stopped with status PARTIAL"
    );
    expect(second.chat.mock.calls[0]?.[1]).toContain(
      "NEXT: change the minus to a plus"
    );
    expect(text(result)).toContain(
      "SHIELD gave it the hand-off of the earlier coder run h1"
    );

    // once continued, it is not handed over again
    const third = deps();
    await handleDelegate(
      { role: "coder", task: "one more thing" },
      team,
      third
    );
    expect(third.chat.mock.calls[0]?.[1]).not.toContain(
      "previous coder stopped"
    );
  });

  it("does not hand a PARTIAL over to a different role, or into a new user message", async () => {
    const team = new TeamRun();
    await handleDelegate(
      { role: "coder", task: "a" },
      team,
      deps("HANDOFF\nSTATUS: PARTIAL\nNEXT: b")
    );

    const tester = deps();
    await handleDelegate({ role: "tester", task: "check it" }, team, tester);
    expect(tester.chat.mock.calls[0]?.[1]).not.toContain("previous");

    team.beginTurn();
    const coder = deps();
    await handleDelegate({ role: "coder", task: "new request" }, team, coder);
    expect(coder.chat.mock.calls[0]?.[1]).not.toContain(
      "previous coder stopped"
    );
  });

  it("stops a delegation loop at the per-turn limit, then allows more after a new user message", async () => {
    const team = new TeamRun();
    for (let i = 0; i < MAX_DELEGATIONS_PER_TURN; i++) {
      expect(
        (await handleDelegate({ role: "tester", task: `t${i}` }, team, deps()))
          .success
      ).toBe(true);
    }
    const over = await handleDelegate(
      { role: "tester", task: "again" },
      team,
      deps()
    );
    expect(over).toMatchObject({
      success: false,
      error: expect.stringContaining("the most allowed"),
    });

    team.beginTurn();
    expect(
      (await handleDelegate({ role: "tester", task: "later" }, team, deps()))
        .success
    ).toBe(true);
  });

  it("returns a failure the orchestrator cannot mistake for the agent's work", async () => {
    const d = deps();
    d.openSession = async () => {
      throw new Error("Agent teams need a model that runs on llama-server");
    };
    const result = await handleDelegate(
      { role: "coder", task: "x" },
      new TeamRun(),
      d
    );
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining(
        "could not run: Agent teams need a model that runs on llama-server"
      ),
    });
    expect(result.error).toContain("do not do its work yourself");
  });

  it("reports PARTIAL as a normal result with how to continue", async () => {
    const result = await handleDelegate(
      { role: "coder", task: "x" },
      new TeamRun(),
      (() => {
        const d = deps(
          'working...\n<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/a"}</arguments>\n</tool_call>'
        );
        d.chat = vi.fn(async (_id: string, message: string) =>
          message.includes("stop here")
            ? "HANDOFF\nSTATUS: PARTIAL\nNEXT: read more"
            : '<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/a' +
              Math.random() +
              '"}</arguments>\n</tool_call>'
        );
        return d;
      })()
    );
    expect(result.success).toBe(true);
    expect(text(result)).toContain("PARTIAL");
    expect(text(result)).toContain('continue_from "h1"');
  });
});
