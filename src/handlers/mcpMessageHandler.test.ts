import { describe, expect, it, vi } from "vitest";
import { processMCPToolCalls } from "./mcpMessageHandler";
import type { Message } from "../hooks/useLlama";

describe("processMCPToolCalls", () => {
  it("executes multiple tool calls and continues once", async () => {
    const assistantMessage: Message = {
      id: "assistant-1",
      role: "assistant",
      content: `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path":"C:\\Users\\Test\\a.txt"}</arguments>
</tool_call>
<tool_call>
<server>filesystem</server>
<tool>list_directory</tool>
<arguments>{"path":"C:\\Users\\Test\\Desktop"}</arguments>
</tool_call>`,
      timestamp: new Date(),
    };

    const onToolCallDetected = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: { content: "alpha" } })
      .mockResolvedValueOnce({
        success: true,
        data: { files: ["a.txt", "b.txt"] },
      });

    const addMessage = vi.fn();
    const continueConversation = vi.fn();

    const handled = await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage,
      continueConversation,
      maxToolCallsPerTurn: 5,
      enableHybridParser: true,
    });

    expect(handled).toBe(true);
    expect(onToolCallDetected).toHaveBeenCalledTimes(2);
    expect(addMessage).toHaveBeenCalledTimes(2);
    expect(continueConversation).toHaveBeenCalledTimes(1);

    const continuationPrompt = continueConversation.mock
      .calls[0]?.[0] as string;
    expect(continuationPrompt).toContain("You executed 2 tool call(s)");
    expect(continuationPrompt).toContain("read_file");
    expect(continuationPrompt).toContain("list_directory");
  });

  it("respects maxToolCallsPerTurn cap", async () => {
    const assistantMessage: Message = {
      id: "assistant-2",
      role: "assistant",
      content: `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path":"C:\\Users\\Test\\a.txt"}</arguments>
</tool_call>
<tool_call>
<server>filesystem</server>
<tool>list_directory</tool>
<arguments>{"path":"C:\\Users\\Test\\Desktop"}</arguments>
</tool_call>`,
      timestamp: new Date(),
    };

    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: {} });
    const addMessage = vi.fn();
    const continueConversation = vi.fn();

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage,
      continueConversation,
      maxToolCallsPerTurn: 1,
    });

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(continueConversation).toHaveBeenCalledTimes(1);
  });
});

describe("multi-round tool chaining", () => {
  const call = (tool: string, args: string) =>
    `<tool_call>
<server>filesystem</server>
<tool>${tool}</tool>
<arguments>${args}</arguments>
</tool_call>`;

  it("executes a follow-up tool call found in the continuation reply", async () => {
    const assistantMessage: Message = {
      id: "assistant-chain",
      role: "assistant",
      content: call("list_directory", '{"path":"C:/Users/me/Desktop"}'),
      timestamp: new Date(),
    };

    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: { content: "ok" } });
    const addMessage = vi.fn();

    // The model answers the first result with another tool call, then plain text
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(
        call("read_file", '{"path":"C:/Users/me/Desktop/test.txt"}')
      )
      .mockResolvedValueOnce("The file says hello. Nothing looks wrong.");

    const handled = await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage,
      continueConversation,
    });

    expect(handled).toBe(true);
    expect(onToolCallDetected).toHaveBeenCalledTimes(2);
    expect(onToolCallDetected.mock.calls[0]?.[0]?.tool).toBe("list_directory");
    expect(onToolCallDetected.mock.calls[1]?.[0]?.tool).toBe("read_file");
    expect(continueConversation).toHaveBeenCalledTimes(2);
  });

  it("stops at the round cap instead of looping forever", async () => {
    const assistantMessage: Message = {
      id: "assistant-loop",
      role: "assistant",
      content: call("list_directory", '{"path":"C:/Users/me/Desktop"}'),
      timestamp: new Date(),
    };

    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: {} });
    const addMessage = vi.fn();
    // A model that never stops asking for tools
    const continueConversation = vi
      .fn()
      .mockResolvedValue(
        call("list_directory", '{"path":"C:/Users/me/Desktop"}')
      );

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage,
      continueConversation,
      maxToolRounds: 3,
    });

    // The loop still ends at the cap. The identical call itself runs only
    // once; the repeats are answered from earlier in the turn.
    expect(continueConversation).toHaveBeenCalledTimes(3);
    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
  });

  it("tells the model to stop calling tools on the final round", async () => {
    const assistantMessage: Message = {
      id: "assistant-final",
      role: "assistant",
      content: call("list_directory", '{"path":"C:/Users/me/Desktop"}'),
      timestamp: new Date(),
    };

    const continueConversation = vi.fn().mockResolvedValue("done");

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected: vi.fn().mockResolvedValue({ success: true }),
      addMessage: vi.fn(),
      continueConversation,
      maxToolRounds: 1,
    });

    const prompt = continueConversation.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("reached the tool call limit");
  });

  it("does not continue when the reply is empty", async () => {
    const assistantMessage: Message = {
      id: "assistant-void",
      role: "assistant",
      content: call("list_directory", '{"path":"C:/Users/me/Desktop"}'),
      timestamp: new Date(),
    };

    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: {} });
    const continueConversation = vi.fn().mockResolvedValue(undefined);

    const handled = await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage: vi.fn(),
      continueConversation,
    });

    expect(handled).toBe(true);
    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    expect(continueConversation).toHaveBeenCalledTimes(1);
  });
});

describe("calls with unreadable arguments", () => {
  it("returns an error to the model without running the tool", async () => {
    const assistantMessage: Message = {
      id: "assistant-bad-args",
      role: "assistant",
      content: `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path": "C:/a.txt",</arguments>
</tool_call>`,
      timestamp: new Date(),
    };

    const onToolCallDetected = vi.fn();
    const continueConversation = vi.fn();

    const handled = await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage: vi.fn(),
      continueConversation,
    });

    expect(handled).toBe(true);
    expect(onToolCallDetected).not.toHaveBeenCalled();
    const continuation = continueConversation.mock.calls[0]?.[0] as string;
    expect(continuation).toContain("not valid JSON");
    expect(continuation).toContain("The call was not run");
  });
});

describe("repeated calls within a turn", () => {
  const call = (tool: string, args: string) =>
    `<tool_call>
<server>filesystem</server>
<tool>${tool}</tool>
<arguments>${args}</arguments>
</tool_call>`;
  const listing = call("list_directory", '{"path":"C:/notes"}');

  it("answers an identical repeat without running it again", async () => {
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: "a.md" });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(listing)
      .mockResolvedValueOnce("There is one file, a.md.");

    await processMCPToolCalls(
      { id: "a", role: "assistant", content: listing, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    const second = continueConversation.mock.calls[1]?.[0] as string;
    expect(second).toContain("already made this exact call");
    expect(second).toContain("a.md");
  });

  it("runs a read again after something changed", async () => {
    const read = call("read_file", '{"path":"C:/a.txt"}');
    const write = call("write_file", '{"path":"C:/a.txt","content":"new"}');
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: "ok" });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(write)
      .mockResolvedValueOnce(read)
      .mockResolvedValueOnce("Updated and verified.");

    await processMCPToolCalls(
      { id: "b", role: "assistant", content: read, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    const tools = onToolCallDetected.mock.calls.map((c) => c[0]?.tool);
    expect(tools).toEqual(["read_file", "write_file", "read_file"]);
  });

  it("does not ask again for a call the user already denied", async () => {
    const write = call("write_file", '{"path":"C:/r.txt","content":"x"}');
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: false, blocked: true, error: "denied" });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(write)
      .mockResolvedValueOnce("I couldn't create it; permission was denied.");

    await processMCPToolCalls(
      { id: "c", role: "assistant", content: write, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
  });
});
