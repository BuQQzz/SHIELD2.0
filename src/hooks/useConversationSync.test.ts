import { describe, expect, it } from "vitest";
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
