import { describe, expect, it, vi } from "vitest";
import {
  handoffMessage,
  mechanicalHandoff,
  transcriptForHandoff,
  writeHandoff,
} from "./handoff";
import type { Message } from "../hooks/useLlama";

const user = (content: string): Message => ({
  id: `u-${content}`,
  role: "user",
  content,
  timestamp: new Date(),
});

const assistant = (content: string): Message => ({
  id: `a-${content}`,
  role: "assistant",
  content,
  timestamp: new Date(),
});

const tool = (name: string, target: string, success = true): Message => ({
  id: `t-${name}-${target}`,
  role: "user",
  content: `${name} ${target}`,
  timestamp: new Date(),
  toolResult: { tool: name, serverName: "filesystem", success, target },
});

describe("transcriptForHandoff", () => {
  it("keeps the user's turns, the model's words and what its tools touched", () => {
    const text = transcriptForHandoff([
      user("Fix calc.py"),
      assistant(
        "Working on it.\n<tool_call><tool>edit_file</tool></tool_call>"
      ),
      tool("edit_file", "calc.py"),
    ]);
    expect(text).toContain("USER: Fix calc.py");
    expect(text).toContain("[ran edit_file calc.py: ok]");
    // Tool markup is plumbing, not something to hand to the next model
    expect(text).not.toContain("tool_call");
  });

  it("keeps the newest turns when the chat is long", () => {
    const messages = Array.from({ length: 40 }, (_, i) => user(`turn ${i}`));
    const text = transcriptForHandoff(messages, 48);
    expect(text).toContain("turn 39");
    expect(text).not.toContain("turn 0");
  });
});

describe("mechanicalHandoff", () => {
  it("names the goal, the files touched and the failed steps", () => {
    const text = mechanicalHandoff([
      user("Add sub(a, b) to calc.py"),
      tool("edit_file", "calc.py", false),
      user("Also add a test"),
    ]);
    expect(text).toContain("GOAL: Add sub(a, b) to calc.py");
    expect(text).toContain("DONE: touched calc.py");
    expect(text).toContain("CAUTION: these steps failed");
    expect(text).toContain("OPEN: Also add a test");
  });

  it("still says something for an almost empty chat", () => {
    expect(mechanicalHandoff([])).toContain("GOAL:");
  });
});

describe("writeHandoff", () => {
  it("uses the model's briefing when it writes one", async () => {
    const ask = vi.fn(
      async () => `GOAL: ship the fix\nDONE: edited calc.py\n${"x".repeat(40)}`
    );
    const { by, text } = await writeHandoff(
      [user("ship the fix"), assistant("done")],
      ask
    );
    expect(by).toBe("model");
    expect(text).toContain("GOAL: ship the fix");
    expect(ask).toHaveBeenCalledOnce();
  });

  it("falls back to the mechanical note when the model fails", async () => {
    const ask = vi.fn(async () => {
      throw new Error("no model loaded");
    });
    const { by, text } = await writeHandoff(
      [user("do the thing"), assistant("ok")],
      ask
    );
    expect(by).toBe("mechanical");
    expect(text).toContain("GOAL: do the thing");
  });

  it("falls back when the model answers with almost nothing", async () => {
    const { by } = await writeHandoff([user("do the thing")], async () => "ok");
    expect(by).toBe("mechanical");
  });

  it("asks nothing when there is nothing to hand over", async () => {
    const ask = vi.fn(async () => "unused");
    const { by } = await writeHandoff([], ask);
    expect(by).toBe("mechanical");
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("handoffMessage", () => {
  it("says where it came from and how it was written", () => {
    const text = handoffMessage({
      text: "GOAL: x",
      by: "mechanical",
      fromModel: "Qwen3 Coder 30B",
      toModel: "Bonsai 2 27B",
    });
    expect(text).toContain(
      "Handoff from a previous session on Qwen3 Coder 30B, for this one on Bonsai 2 27B."
    );
    expect(text).toContain("Assembled by SHIELD");
    expect(text).toContain("GOAL: x");
    expect(text).toContain("Continue from here.");
  });
});
