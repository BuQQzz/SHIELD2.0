import { describe, expect, it } from "vitest";
import {
  keptThinking,
  noteBody,
  THINKING_CHARS,
  withRequestThinking,
} from "./LlamaServerProvider";
import { nativeHistory } from "./llamaServer/nativeHistory";
import type { ChatMessage } from "./chatTypes";

const call = `<tool_call><tool>run_command</tool><arguments>{"command":"ls"}</arguments></tool_call>`;
const result = `<tool_result trusted="false"><tool>run_command</tool><result>spend.py</result></tool_result>`;
const thoughts = (turns: ChatMessage[]) => turns.map((t) => t.reasoning ?? null);

describe("thinking within a request (g24 step 16)", () => {
  it("drops the budget note and trims", () => {
    expect(
      keptThinking("The user means YYYY-MM.\n\nThinking budget reached. Act now on what I have worked out.\n")
    ).toBe("The user means YYYY-MM.");
  });

  it("keeps it only on replies since the user's latest message", () => {
    const turns: ChatMessage[] = [
      { role: "user", content: "make a tracker" },
      { role: "assistant", content: call, reasoning: "old request" },
      { role: "user", content: result },
      { role: "assistant", content: "Done.", reasoning: "old answer" },
      { role: "user", content: "show dates like the monthly view" },
      { role: "assistant", content: call, reasoning: "they mean YYYY-MM" },
      // tool results do not start a new request, nor do they after a note
      { role: "user", content: `[SHIELD removed from your context to save space: x]\n${result}` },
      { role: "assistant", content: call, reasoning: "export writes r['date']" },
      { role: "user", content: result },
    ];
    expect(thoughts(withRequestThinking(turns))).toEqual([
      null, null, null, null, null, "they mean YYYY-MM", null, "export writes r['date']", null,
    ]);
  });

  it("keeps sets up to the cap: a new set when the next thought does not fit (g26)", () => {
    const big = "x".repeat(THINKING_CHARS / 2 - 10);
    const turns: ChatMessage[] = [{ role: "user", content: "go" }];
    const kept = () => (thoughts(withRequestThinking(turns)).filter(Boolean) as string[]).map((t) => t[0]);
    for (let i = 0; i < 5; i++) {
      turns.push({ role: "assistant", content: call, reasoning: `${i}${big}` });
      turns.push({ role: "user", content: result });
    }
    // 0 and 1 filled a set; 2 and 3 the next; 4 starts a third
    expect(kept()).toEqual(["4"]);
    turns.pop();
    turns.pop();
    expect(kept()).toEqual(["2", "3"]);
    turns.pop();
    turns.pop();
    // Within a set what was sent stays the same
    expect(kept()).toEqual(["2"]);
  });

  it("leaves out the thought behind a call that failed (kt-fix2)", () => {
    const turns: ChatMessage[] = [
      { role: "user", content: "fix kit_tool.py" },
      { role: "assistant", content: call, reasoning: "read GlobaPreparedness_Research.md" },
      { role: "user", content: `<tool_result trusted="false"><tool>run_command</tool><error>ENOENT: no such file</error></tool_result>` },
      { role: "assistant", content: call, reasoning: "list the folder" },
      { role: "user", content: result },
    ];
    expect(thoughts(withRequestThinking(turns))).toEqual([null, null, null, "list the folder", null]);
  });

  it("travels with a native call as its reasoning", () => {
    const wire = nativeHistory([
      { role: "user", content: "go" },
      { role: "assistant", content: call, reasoning: "list first" },
      { role: "user", content: result },
    ]);
    expect(wire[1]).toMatchObject({ role: "assistant", reasoning: "list first", tool_calls: [{ function: { name: "run_command" } }] });
  });
});

describe("the note request goes on from the chat's last prompt (g32)", () => {
  const tools = [{ type: "function", function: { name: "run_command" } }];
  const turns: ChatMessage[] = [
    { role: "user", content: "make a tracker" },
    { role: "assistant", content: call, reasoning: "list the folder" },
    { role: "user", content: result },
    { role: "assistant", content: call, reasoning: "run it" },
  ];

  it("sends the turns, tools and thinking the chat sent, then the note request", () => {
    const body = noteBody("system", turns, result, tools);
    const chat = nativeHistory(withRequestThinking(turns)).map((m) => {
      const { reasoning, ...rest } = m as ChatMessage;
      return reasoning ? { ...rest, reasoning_content: reasoning } : rest;
    });
    expect(body.messages.slice(0, -1)).toEqual([{ role: "system", content: "system" }, ...chat]);
    expect(body.messages.at(-1)).toMatchObject({ role: "user" });
    expect(String((body.messages.at(-1) as ChatMessage).content)).toContain("Write a note");
    expect(body.tools).toBe(tools);
    // a note, not a tool call
    expect(body.tool_choice).toBe("none");
  });

  it("sends no tools for a model without native calls", () => {
    const body = noteBody("system", turns, result, []);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });
});
