import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConversationSync } from "./useConversationSync";
import { stripToolCallMarkup } from "@/handlers/mcpToolHandler";
import type { Message } from "@/hooks/useLlama";

/**
 * Plan mode has to edit the history the model sees, because in-context
 * examples of tool calls beat the system prompt telling it not to call tools.
 * This covers the transform useConversationSync applies.
 */
function historyForPlanMode(messages: Message[]): Message[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? { ...message, content: stripToolCallMarkup(message.content) }
      : message
  );
}

const call = `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path":"C:/a.txt"}</arguments>
</tool_call>`;

const messages: Message[] = [
  { id: "1", role: "user", content: "read my file", timestamp: new Date() },
  {
    id: "2",
    role: "assistant",
    content: `I'll read it.\n\n${call}`,
    timestamp: new Date(),
  },
  {
    id: "3",
    role: "user",
    content: "<tool_result><result>hello</result></tool_result>",
    timestamp: new Date(),
  },
  {
    id: "4",
    role: "assistant",
    content: "The file says hello.",
    timestamp: new Date(),
  },
];

describe("plan mode history", () => {
  it("removes the tool calls the model would otherwise copy", () => {
    const history = historyForPlanMode(messages);

    expect(history[1]?.content).toBe("I'll read it.");
    expect(history.some((m) => m.content.includes("tool_call"))).toBe(false);
  });

  it("leaves user turns alone", () => {
    const history = historyForPlanMode(messages);

    expect(history[0]?.content).toBe("read my file");
    // Tool results are not examples of call syntax, so they stay
    expect(history[2]?.content).toContain("tool_result");
  });

  it("leaves assistant prose alone", () => {
    expect(historyForPlanMode(messages)[3]?.content).toBe(
      "The file says hello."
    );
  });

  it("does not drop a message that was only a tool call", () => {
    const onlyCall: Message[] = [
      { id: "1", role: "assistant", content: call, timestamp: new Date() },
    ];

    const history = historyForPlanMode(onlyCall);
    expect(history).toHaveLength(1);
    expect(history[0]?.content).toBe("");
  });
});

// Seen in the app, 2026-09-23: history was restored on every added message,
// replacing the model's session mid-turn (before and after each tool round).
describe("when the model's history is restored", () => {
  const conv = (id: string, count: number) => ({
    id,
    messages: messages.slice(0, count),
  });

  const setup = (initial: { id: string; messages: Message[] }) => {
    const setChatHistory = vi.fn().mockResolvedValue(undefined);
    const clearHistory = vi.fn().mockResolvedValue(undefined);
    const hook = renderHook(
      (props: {
        currentConversation: { id: string; messages: Message[] };
        modelKey?: string;
      }) =>
        useConversationSync({
          isModelLoaded: true,
          setChatHistory,
          clearHistory,
          setMessages: vi.fn(),
          ...props,
        }),
      { initialProps: { currentConversation: initial, modelKey: "m1" } }
    );
    return { ...hook, setChatHistory, clearHistory };
  };

  it("restores once when a chat is opened, not as the turn adds messages", () => {
    const { rerender, setChatHistory } = setup(conv("a", 1));
    expect(setChatHistory).toHaveBeenCalledTimes(1);

    rerender({ currentConversation: conv("a", 2), modelKey: "m1" });
    rerender({ currentConversation: conv("a", 3), modelKey: "m1" });
    rerender({ currentConversation: conv("a", 4), modelKey: "m1" });
    expect(setChatHistory).toHaveBeenCalledTimes(1);
  });

  it("restores when switching to another chat", () => {
    const { rerender, setChatHistory } = setup(conv("a", 2));
    rerender({ currentConversation: conv("b", 4), modelKey: "m1" });
    expect(setChatHistory).toHaveBeenCalledTimes(2);
    expect(setChatHistory.mock.calls[1]?.[0]).toHaveLength(4);
  });

  it("restores again after a different model is loaded", () => {
    const { rerender, setChatHistory } = setup(conv("a", 2));
    rerender({ currentConversation: conv("a", 2), modelKey: "m2" });
    expect(setChatHistory).toHaveBeenCalledTimes(2);
  });

  it("clears the model's history for a new, empty chat", () => {
    const { rerender, clearHistory, setChatHistory } = setup(conv("a", 2));
    rerender({ currentConversation: conv("new", 0), modelKey: "m1" });
    expect(clearHistory).toHaveBeenCalledTimes(1);

    // The first message in the new chat does not trigger a restore
    rerender({ currentConversation: conv("new", 1), modelKey: "m1" });
    expect(setChatHistory).toHaveBeenCalledTimes(1);
  });
});
