import { describe, expect, it, vi } from "vitest";
import {
  callSignature,
  processMCPToolCalls,
  unrunToolCallsNote,
} from "./mcpMessageHandler";
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

  it("says so when the round limit stops a call from running", async () => {
    const assistantMessage: Message = {
      id: "assistant-limit",
      role: "assistant",
      content: call("list_directory", '{"path":"C:/Users/me/Desktop"}'),
      timestamp: new Date(),
    };
    const addMessage = vi.fn();

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected: vi.fn().mockResolvedValue({ success: true }),
      addMessage,
      continueConversation: vi
        .fn()
        .mockResolvedValue(
          call("write_file", '{"path":"a.txt","content":"x"}')
        ),
      maxToolRounds: 1,
    });

    const notice = addMessage.mock.calls.at(-1)?.[0] as Message;
    expect(notice.role).toBe("assistant");
    expect(notice.content).toContain("write_file");
    expect(notice.content).toContain("continue");
    // Kept so the next prompt can tell the model the call never happened
    expect(notice.unrunToolCalls).toEqual(["write_file a.txt"]);
    expect(unrunToolCallsNote(notice.unrunToolCalls!)).toContain(
      "never executed"
    );
  });

  it("keeps going when a reply is cut off mid-call", async () => {
    const assistantMessage: Message = {
      id: "assistant-cut",
      role: "assistant",
      content: call("list_directory", '{"path":"."}'),
      timestamp: new Date(),
    };
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: {} });
    // Hits the token limit inside the arguments, then retries in parts
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(
        'Now let\'s enhance app.js:\n<tool_call>\n<server>filesystem</server>\n<tool>edit_file</tool>\n<arguments>{"path":"app.js","edits":[{"oldText":"class'
      )
      .mockResolvedValueOnce("I'll write it in smaller parts.");

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage: vi.fn(),
      continueConversation,
    });

    // The cut-off call never runs; the model hears why and gets another turn
    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    expect(continueConversation).toHaveBeenCalledTimes(2);
    const prompt = continueConversation.mock.calls[1]?.[0] as string;
    expect(prompt).toContain("cut off");
    expect(prompt).toContain("smaller steps");
    expect(prompt).not.toContain("valid JSON object");
  });

  it("reports a tool that answered with isError as a failure", async () => {
    const assistantMessage: Message = {
      id: "assistant-iserror",
      role: "assistant",
      content: call("edit_file", '{"path":"a.css","edits":[]}'),
      timestamp: new Date(),
    };
    const addMessage = vi.fn();
    const continueConversation = vi.fn().mockResolvedValue("ok");

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected: vi.fn().mockResolvedValue({
        success: true,
        data: {
          isError: true,
          content: [{ type: "text", text: "Input validation error" }],
        },
      }),
      addMessage,
      continueConversation,
    });

    const row = addMessage.mock.calls[0]?.[0] as Message;
    expect(row.toolResult?.success).toBe(false);
    const prompt = continueConversation.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("<error>Input validation error</error>");
  });

  it("tells the model how to fix an edit that did not match", async () => {
    const assistantMessage: Message = {
      id: "assistant-miss",
      role: "assistant",
      content: call(
        "edit_file",
        '{"path":"a.js","edits":[{"oldText":"x","newText":"y"}]}'
      ),
      timestamp: new Date(),
    };
    const continueConversation = vi.fn().mockResolvedValue("ok");

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected: vi.fn().mockResolvedValue({
        success: true,
        data: {
          isError: true,
          content: [
            { type: "text", text: "Could not find exact match for edit:\nx" },
          ],
        },
      }),
      addMessage: vi.fn(),
      continueConversation,
    });

    const prompt = continueConversation.mock.calls[0]?.[0] as string;
    expect(prompt).toContain("Read the file with read_text_file first");
  });

  it("ends the turn when the user pressed Stop", async () => {
    const assistantMessage: Message = {
      id: "assistant-stop",
      role: "assistant",
      content: call("list_directory", '{"path":"."}'),
      timestamp: new Date(),
    };
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: {} });
    let stopped = false;
    // Stop pressed while this reply streamed; it ends mid-call
    const continueConversation = vi.fn().mockImplementation(async () => {
      stopped = true;
      return (
        call("read_file", '{"path":"a.txt"}') +
        '\n<tool_call>\n<tool>write_file</tool>\n<arguments>{"path":"b'
      );
    });

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected,
      addMessage: vi.fn(),
      continueConversation,
      isStopped: () => stopped,
    });

    // Nothing after the stop runs, and it is not reported as a cut-off
    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    expect(continueConversation).toHaveBeenCalledTimes(1);
  });

  it("adds no notice when the final reply is plain text", async () => {
    const assistantMessage: Message = {
      id: "assistant-limit-text",
      role: "assistant",
      content: call("list_directory", '{"path":"C:/Users/me/Desktop"}'),
      timestamp: new Date(),
    };
    const addMessage = vi.fn();

    await processMCPToolCalls(assistantMessage, {
      onToolCallDetected: vi.fn().mockResolvedValue({ success: true }),
      addMessage,
      continueConversation: vi.fn().mockResolvedValue("All done."),
      maxToolRounds: 1,
    });

    // Only the tool result
    expect(addMessage).toHaveBeenCalledTimes(1);
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

// Seen in the app, 2026-09-22: "read the index and find bugs" read
// {"path":"index.html"} and then {"path":"C:\...\EXPERIMENT\index.html"},
// and the repeat check treated them as different calls.
describe("callSignature", () => {
  const ws = String.raw`C:\Users\me\Projects\EXPERIMENT`;
  const call = (path: string) => ({
    serverName: "filesystem",
    tool: "read_text_file",
    arguments: { path },
  });

  it("treats relative and absolute paths to the same file as one call", () => {
    const relative = callSignature(call("index.html"), ws);
    expect(callSignature(call(String.raw`${ws}\index.html`), ws)).toBe(
      relative
    );
    expect(callSignature(call("./index.html"), ws)).toBe(relative);
    const forwardSlashes = ws.split("\\").join("/");
    expect(callSignature(call(`${forwardSlashes}/INDEX.html`), ws)).toBe(
      relative
    );
  });

  it("treats '.' as the workspace itself", () => {
    const listing = (path: string) => ({
      serverName: "filesystem",
      tool: "list_directory",
      arguments: { path },
    });
    expect(callSignature(listing("."), ws)).toBe(
      callSignature(listing(ws), ws)
    );
  });

  it("keeps different files and different tools apart", () => {
    expect(callSignature(call("a.md"), ws)).not.toBe(
      callSignature(call("b.md"), ws)
    );
    expect(callSignature(call("a.md"), ws)).not.toBe(
      callSignature({ ...call("a.md"), tool: "get_file_info" }, ws)
    );
  });

  it("answers the relative-then-absolute reread from memory", async () => {
    const read = (path: string) =>
      `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>${JSON.stringify({ path })}</arguments>\n</tool_call>`;
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: "<html>" });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(read(String.raw`${ws}\index.html`))
      .mockResolvedValueOnce("Found two bugs.");

    await processMCPToolCalls(
      {
        id: "r",
        role: "assistant",
        content: read("index.html"),
        timestamp: new Date(),
      },
      {
        onToolCallDetected,
        addMessage: vi.fn(),
        continueConversation,
        workspaceFolder: ws,
      }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
  });
});

describe("large results and repeats", () => {
  const read = `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"C:/p/index.html"}</arguments>\n</tool_call>`;
  const bigFile = { content: [{ type: "text", text: "z".repeat(33846) }] };

  it("cuts a result to the budget before the model sees it", async () => {
    const continueConversation = vi.fn().mockResolvedValueOnce("Done.");
    await processMCPToolCalls(
      { id: "b1", role: "assistant", content: read, timestamp: new Date() },
      {
        onToolCallDetected: vi
          .fn()
          .mockResolvedValue({ success: true, data: bigFile }),
        addMessage: vi.fn(),
        continueConversation,
        maxResultChars: 8601,
      }
    );
    const sent = continueConversation.mock.calls[0]?.[0] as string;
    expect(sent.length).toBeLessThan(10_000);
    expect(sent).toContain("[Truncated:");
  });

  it("does not resend a large result when the call is repeated", async () => {
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(read)
      .mockResolvedValueOnce("Here is the rewrite.");
    await processMCPToolCalls(
      { id: "b2", role: "assistant", content: read, timestamp: new Date() },
      {
        onToolCallDetected: vi
          .fn()
          .mockResolvedValue({ success: true, data: bigFile }),
        addMessage: vi.fn(),
        continueConversation,
        maxResultChars: 8601,
      }
    );
    const repeat = continueConversation.mock.calls[1]?.[0] as string;
    expect(repeat).toContain("its result is not repeated");
    expect(repeat).not.toContain("zzzz");
  });
});
