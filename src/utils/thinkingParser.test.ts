import { describe, expect, it } from "vitest";
import { parseAllThinking, parseThinking } from "./thinkingParser";

describe("<think> reasoning", () => {
  it("splits a normal <think>...</think> answer", () => {
    expect(
      parseThinking("<think>Let me work it out.</think>The answer is 4.")
    ).toEqual({
      thinking: "Let me work it out.",
      processedContent: "The answer is 4.",
    });
  });

  // Seen live: the template opened <think> in the prompt, the budget cut the
  // thought off, and the model carried on in the answer and closed it itself
  it("treats everything before a lone </think> as thinking", () => {
    const leaked =
      "one call per message. I'll call update_plan. Wait, I can just delegate. Let's do it. </think>";
    expect(parseThinking(leaked)).toEqual({
      thinking:
        "one call per message. I'll call update_plan. Wait, I can just delegate. Let's do it.",
      processedContent: "",
    });
    expect(
      parseThinking("Considering both options...\n</think>\nFIRST: tester")
    ).toEqual({
      thinking: "Considering both options...",
      processedContent: "FIRST: tester",
    });
  });

  it("keeps reasoning that contains code blocks", () => {
    const text = "Check:\n```py\nx = 1\n```\nso x is 1.</think>Done.";
    expect(parseThinking(text)).toEqual({
      thinking: "Check:\n```py\nx = 1\n```\nso x is 1.",
      processedContent: "Done.",
    });
  });

  it("leaves an answer alone that shows the tag in a code block", () => {
    const text =
      "Close a reasoning block with:\n```\n</think>\n```\nand the answer follows.";
    expect(parseThinking(text)).toEqual({ processedContent: text });
  });

  it("does nothing to an answer without the tag, and ignores an empty thought", () => {
    expect(parseThinking("Just an answer.")).toEqual({
      processedContent: "Just an answer.",
    });
    expect(parseThinking("</think>The answer.").thinking).toBeUndefined();
  });

  it("flows through parseAllThinking for the chat", () => {
    const parsed = parseAllThinking(
      "Hmm, let me think.</think>Use grep.",
      false,
      false
    );
    expect(parsed.thinking).toBe("Hmm, let me think.");
    expect(parsed.processedContent).toBe("Use grep.");
  });

  it("still handles the older tag formats", () => {
    expect(parseThinking("<thinking>a</thinking>b").thinking).toBe("a");
  });
});
