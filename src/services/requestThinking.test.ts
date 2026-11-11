import { describe, expect, it } from "vitest";
import {
  keptThinking,
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

  it("keeps the oldest up to the cap, so what was sent never changes", () => {
    const big = "x".repeat(THINKING_CHARS / 2 - 10);
    const turns: ChatMessage[] = [{ role: "user", content: "go" }];
    for (let i = 0; i < 4; i++) {
      turns.push({ role: "assistant", content: call, reasoning: `${i}${big}` });
      turns.push({ role: "user", content: result });
    }
    const kept = thoughts(withRequestThinking(turns)).filter(Boolean) as string[];
    expect(kept.map((t) => t[0])).toEqual(["0", "1"]);
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
