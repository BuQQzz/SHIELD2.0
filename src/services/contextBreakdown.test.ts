import { describe, expect, it } from "vitest";
import {
  breakDownContext,
  isToolResultTurn,
  splitSystemPrompt,
  type HistoryItem,
} from "./contextBreakdown";

// One token per word keeps the arithmetic readable
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const window = { rendered: 0, size: 8192, trainContextSize: 262144 };

describe("splitSystemPrompt", () => {
  it("separates SHIELD's tool section from the base prompt", () => {
    const { base, tools } = splitSystemPrompt(
      "You are SHIELD.\n\n## Tool Usage\nCall tools.\n## 🔧 Available Tools\nread_file"
    );
    expect(base).toBe("You are SHIELD.\n\n");
    expect(tools.startsWith("## Tool Usage")).toBe(true);
    expect(tools).toContain("read_file");
  });

  it("treats Plan mode as tool instructions too", () => {
    expect(splitSystemPrompt("Base.\n## Plan Mode\nDescribe.").tools).toBe(
      "## Plan Mode\nDescribe."
    );
  });

  it("is all base when there are no tools", () => {
    expect(splitSystemPrompt("Just chat.")).toEqual({
      base: "Just chat.",
      tools: "",
    });
  });
});

describe("isToolResultTurn", () => {
  it("recognises tool continuations and stored results", () => {
    expect(isToolResultTurn("You executed 1 tool call(s). Here...")).toBe(true);
    expect(isToolResultTurn('<tool_result trusted="false">...')).toBe(true);
    expect(isToolResultTurn("what's in this folder?")).toBe(false);
  });
});

describe("breakDownContext", () => {
  const history: HistoryItem[] = [
    { type: "system", text: "one two three\n## Tool Usage four five" },
    { type: "user", text: "list my files please" },
    {
      type: "model",
      response: ["I will check", { type: "functionCall", text: undefined }],
    },
    { type: "user", text: "You executed 1 tool call(s). a b c" },
    { type: "model", response: ["two files"] },
  ];

  it("counts each kind of content", () => {
    const { parts } = breakDownContext(history, words, window);
    expect(parts.systemPrompt).toBe(3);
    expect(parts.toolInstructions).toBe(5); // "##", "Tool", "Usage", "four", "five"
    expect(parts.messages).toBe(4 + 3 + 2);
    expect(parts.toolResults).toBe(8);
  });

  it("reports the template's extra tokens as formatting", () => {
    const counted = 3 + 5 + 9 + 8;
    const result = breakDownContext(history, words, {
      ...window,
      rendered: 40,
    });
    expect(result.used).toBe(40);
    expect(result.total).toBe(40);
    expect(result.dropped).toBe(0);
    expect(result.parts.formatting).toBe(40 - counted);
  });

  it("never reports less than the history holds", () => {
    const result = breakDownContext(history, words, { ...window, rendered: 0 });
    expect(result.used).toBe(25);
    expect(result.parts.formatting).toBe(0);
  });

  // Seen in the app: a 34k-character file read three times made the chat
  // 30.4k tokens in an 8.2k window, and the panel showed 234% and 115%.
  it("caps what the model sees at the window and reports the overflow", () => {
    const result = breakDownContext(history, words, {
      rendered: 30,
      size: 20,
      trainContextSize: 262144,
    });
    expect(result.used).toBe(20);
    expect(result.total).toBe(30);
    expect(result.dropped).toBe(10);
  });
});
