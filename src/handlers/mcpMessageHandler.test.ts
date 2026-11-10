import { describe, expect, it, vi } from "vitest";
import {
  callSignature,
  callTarget,
  canonicalPath,
  failureSignature,
  processMCPToolCalls,
  tracebackPlace,
  unrunToolCallsNote,
} from "./mcpMessageHandler";
import type { Message } from "../hooks/useLlama";

describe("processMCPToolCalls", () => {
  it("does not resume a native request when stopped during tool execution", async () => {
    let stopped = false;
    const addMessage = vi.fn();
    const continueConversation = vi.fn();
    await processMCPToolCalls(
      {
        id: "native-stop",
        role: "assistant",
        timestamp: new Date(),
        content: JSON.stringify({
          tool_calls: [
            {
              id: "native-stop",
              type: "function",
              function: {
                name: "filesystem.read_text_file",
                arguments: '{"path":"C:/fixture.txt"}',
              },
            },
          ],
        }),
      },
      {
        onToolCallDetected: async () => {
          stopped = true;
          return { success: true, data: "done" };
        },
        isStopped: () => stopped,
        addMessage,
        continueConversation,
      }
    );
    expect(addMessage).toHaveBeenCalledTimes(1);
    expect(continueConversation).not.toHaveBeenCalled();
  });

  it("keeps ordinary OpenAI IDs on the legacy text continuation", async () => {
    const continueConversation = vi.fn().mockResolvedValue("Done.");
    await processMCPToolCalls(
      {
        id: "legacy",
        role: "assistant",
        timestamp: new Date(),
        content: JSON.stringify({
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "filesystem.read_text_file",
                arguments: '{"path":"C:/fixture.txt"}',
              },
            },
          ],
        }),
      },
      {
        onToolCallDetected: vi
          .fn()
          .mockResolvedValue({ success: true, data: "data" }),
        addMessage: vi.fn(),
        continueConversation,
      }
    );
    expect(continueConversation.mock.calls[0]?.[0]).toContain("data");
    expect(continueConversation.mock.calls[0]?.[1]).toBeUndefined();
  });

  it.each([true, false])(
    "returns an OpenAI-style call's permission result as text (allowed=%s)",
    async (allowed) => {
      const onToolCallDetected = vi.fn().mockResolvedValue(
        allowed
          ? {
              success: true,
              data: { content: [{ type: "text", text: "fixture value" }] },
            }
          : {
              success: false,
              blocked: true,
              error: "Permission denied by user",
            }
      );
      const continueConversation = vi.fn().mockResolvedValue("Finished.");
      await processMCPToolCalls(
        {
          id: "native-request",
          role: "assistant",
          timestamp: new Date(),
          content: JSON.stringify({
            tool_calls: [
              {
                id: "native-1",
                type: "function",
                function: {
                  name: "filesystem.read_text_file",
                  arguments: JSON.stringify({ path: "C:/fixture.txt" }),
                },
              },
            ],
          }),
        },
        { onToolCallDetected, continueConversation, addMessage: vi.fn() }
      );
      expect(onToolCallDetected).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: "native-1",
          serverName: "filesystem",
          tool: "read_text_file",
          arguments: { path: "C:/fixture.txt" },
        })
      );
      expect(continueConversation).toHaveBeenCalledWith(
        expect.stringContaining(
          allowed ? "fixture value" : "Permission denied by user"
        )
      );
    }
  );

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
    expect(notice.content).toContain("Continue");
    expect(notice.resumable).toBe(true);
    // Kept so the next prompt can tell the model the call never happened
    expect(notice.unrunToolCalls).toEqual(["write_file a.txt"]);
    expect(unrunToolCallsNote(notice.unrunToolCalls!)).toContain(
      "never executed"
    );
  });

  it("keeps researching past any fixed cap while each round finds something new", async () => {
    let n = 0;
    const continueConversation = vi.fn(async () =>
      ++n < 25 ? call("search", `{"query":"q${n}"}`) : "Here is what I found."
    );
    const addMessage = vi.fn();

    await processMCPToolCalls(
      {
        id: "assistant-research",
        role: "assistant",
        content: call("search", '{"query":"q0"}'),
        timestamp: new Date(),
      },
      {
        onToolCallDetected: vi.fn().mockResolvedValue({ success: true }),
        addMessage,
        continueConversation,
        maxToolRounds: Infinity,
        progressCheckEvery: 10,
      }
    );

    expect(continueConversation).toHaveBeenCalledTimes(25);
    const notices = addMessage.mock.calls
      .map(([message]) => message as Message)
      .filter((message) => message.role === "assistant");
    expect(notices).toEqual([]);
  });

  it("pauses at a check when the last rounds found nothing new", async () => {
    let n = 0;
    const continueConversation = vi.fn(async () =>
      call("fetch_page", `{"url":"https://example.com/${++n}"}`)
    );
    const addMessage = vi.fn();

    await processMCPToolCalls(
      {
        id: "assistant-circles",
        role: "assistant",
        content: call("fetch_page", '{"url":"https://example.com/0"}'),
        timestamp: new Date(),
      },
      {
        // Every page fails: rounds go by with no new result
        onToolCallDetected: vi
          .fn()
          .mockResolvedValue({ success: false, error: "404" }),
        addMessage,
        continueConversation,
        maxToolRounds: Infinity,
        progressCheckEvery: 10,
      }
    );

    expect(continueConversation).toHaveBeenCalledTimes(10);
    const notice = addMessage.mock.calls.at(-1)?.[0] as Message;
    expect(notice.content).toContain("Paused after 10 rounds");
    expect(notice.resumable).toBe(true);
    expect(notice.unrunToolCalls).toEqual([
      "fetch_page https://example.com/10",
    ]);
  });

  it("shows the file's closest lines when an edit finds no exact match", async () => {
    const addMessage = vi.fn();
    const readFile = vi
      .fn()
      .mockResolvedValue("# List\n| 📍 Long Island | N/A | Local\n- Water");
    await processMCPToolCalls(
      {
        id: "assistant-miss",
        role: "assistant",
        content: call(
          "edit_file",
          '{"path":"/p/a.md","edits":[{"oldText":"| 📍 Long Island | N/A | Local |","newText":"x"}]}'
        ),
        timestamp: new Date(),
      },
      {
        onToolCallDetected: vi.fn().mockResolvedValue({
          success: false,
          error: "Could not find exact match for edit: | 📍 Long Island",
        }),
        addMessage,
        continueConversation: vi.fn().mockResolvedValue("ok"),
        readFile,
      }
    );
    expect(readFile).toHaveBeenCalledWith("/p/a.md");
    const result = (addMessage.mock.calls[0]?.[0] as Message).content;
    expect(result).toContain("at line 2");
    expect(result).toContain("BEGIN\n| 📍 Long Island | N/A | Local\nEND");
  });

  it("never runs a call from a reply that copied a removal note", async () => {
    const onToolCallDetected = vi.fn();
    const addMessage = vi.fn();
    await processMCPToolCalls(
      {
        id: "assistant-copied",
        role: "assistant",
        content:
          '<tool_call>\n<server>filesystem</server>\n<tool>write_file</tool>\n<arguments>{"path":"/p/a.md"}</arguments>\n</tool>\n[SHIELD removed from your context to save space: 6,736 characters of the call above. The call already ran.]',
        timestamp: new Date(),
      },
      {
        onToolCallDetected,
        addMessage,
        continueConversation: vi.fn().mockResolvedValue("ok"),
        maxToolRounds: 3,
      }
    );
    expect(onToolCallDetected).not.toHaveBeenCalled();
    const result = addMessage.mock.calls[0]?.[0] as Message;
    expect(result.content).toContain("copied one of SHIELD's notes");
    expect(result.content).toContain("path and the whole content");
    expect(result.content).not.toContain("length limit");
  });

  it("says when append_file put code below a script's __main__ block", async () => {
    const helper = "def write_xlsx(rows):\n    return len(rows)\n";
    const file = `def main():\n    write_xlsx([])\n\n\nif __name__ == "__main__":\n    main()\n${helper}`;
    const addMessage = vi.fn();
    const append = (path: string) =>
      processMCPToolCalls(
        {
          id: `assistant-append-${path}`,
          role: "assistant",
          content: `<tool_call>\n<server>filesystem</server>\n<tool>append_file</tool>\n<arguments>${JSON.stringify({ path, content: helper })}</arguments>\n</tool_call>`,
          timestamp: new Date(),
        },
        {
          onToolCallDetected: vi
            .fn()
            .mockResolvedValue({ success: true, data: "Appended." }),
          addMessage,
          continueConversation: vi.fn().mockResolvedValue("ok"),
          maxToolRounds: 1,
          readFile: vi.fn().mockResolvedValue(file),
        }
      );

    await append("/p/spend.py");
    const noted = (addMessage.mock.calls[0]?.[0] as Message).content;
    expect(noted).toContain("Appended.");
    expect(noted).toContain('block at line 5 of spend.py');

    // Not for other files, nor when the block comes after the new text
    addMessage.mockClear();
    await append("/p/notes.md");
    expect((addMessage.mock.calls[0]?.[0] as Message).content).not.toContain(
      "__main__"
    );
  });

  it("says when Python text opens a triple-quoted string it never closes", async () => {
    const run = async (tool: string, args: Record<string, unknown>, file: string) => {
      const addMessage = vi.fn();
      await processMCPToolCalls(
        {
          id: `assistant-quote-${tool}-${JSON.stringify(args).length}`,
          role: "assistant",
          content: `<tool_call>\n<server>filesystem</server>\n<tool>${tool}</tool>\n<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`,
          timestamp: new Date(),
        },
        {
          onToolCallDetected: vi.fn().mockResolvedValue({ success: true, data: "OK" }),
          addMessage,
          continueConversation: vi.fn().mockResolvedValue("ok"),
          maxToolRounds: 1,
          readFile: vi.fn().mockResolvedValue(file),
        }
      );
      return (addMessage.mock.calls[0]?.[0] as Message).content;
    };
    // g13 step 14: a docstring closed with one quote
    const added =
      'def _audit(action, detail):\n    """Append one line to the audit log so every\n    change is recorded with a timestamp and profile."\n    pass\n';
    const file = `import os\n\n\n${added}\ndef main():\n    """Run."""\n`;
    const noted = await run(
      "edit_file",
      { path: "/p/spend.py", edits: [{ oldText: "import os\n", newText: `import os\n\n\n${added}` }] },
      file
    );
    expect(noted).toContain("opens a triple-quoted string at line 5");
    expect(noted).toContain('"""Append one line to the audit log so every');

    // Balanced text, an edit that only moves a closing quote, other files
    expect(
      await run("edit_file", { path: "/p/spend.py", edits: [{ oldText: "x", newText: '"""Doc."""' }] }, file)
    ).not.toContain("triple-quoted");
    expect(
      await run("edit_file", { path: "/p/spend.py", edits: [{ oldText: 'every\n    """', newText: 'every."""' }] }, file)
    ).not.toContain("triple-quoted");
    expect(await run("append_file", { path: "/p/notes.md", content: '"""' }, file)).not.toContain("triple-quoted");
    expect(await run("write_file", { path: "/p/a.py", content: added }, added)).toContain("opens a triple-quoted string at line 2");
  });

  it("shows a big read of a code file in part, with an outline", async () => {
    const lines = Array.from({ length: 500 }, (_, i) =>
      i % 50 === 0 ? `def step_${i + 1}(args):` : `    x = ${i + 1}`
    );
    const file = `${lines.join("\n")}\n`;
    const read = async (args: Record<string, unknown>, data: string) => {
      const addMessage = vi.fn();
      await processMCPToolCalls(
        {
          id: `assistant-read-${JSON.stringify(args)}`,
          role: "assistant",
          content: `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`,
          timestamp: new Date(),
        },
        {
          onToolCallDetected: vi.fn().mockResolvedValue({ success: true, data }),
          addMessage,
          continueConversation: vi.fn().mockResolvedValue("ok"),
          maxToolRounds: 1,
          readFile: vi.fn().mockResolvedValue(file),
        }
      );
      return (addMessage.mock.calls[0]?.[0] as Message).content;
    };

    const whole = await read({ path: "/p/spend.py" }, file);
    expect(whole).toContain("spend.py has 500 lines. You asked for 500 of them (lines 1-500)");
    expect(whole).toContain("Lines 1-200:");
    expect(whole).toContain("    x = 200\n");
    expect(whole).not.toContain("    x = 201\n");
    expect(whole).toContain("51: def step_51(args)");
    expect(whole).toContain("451: def step_451(args)");
    expect(whole).toContain("sed -n 'START,ENDp' /p/spend.py");

    // A tail read keeps its end, numbered as in the file
    const tail = await read(
      { path: "/p/spend.py", tail: 370 },
      `${lines.slice(-370).join("\n")}\n`
    );
    expect(tail).toContain("(lines 131-500)");
    expect(tail).toContain("Lines 301-500:");
    expect(tail).toContain("    x = 500");
    expect(tail).not.toContain("    x = 300\n");

    // Small reads and other files are left as they are
    const small = await read({ path: "/p/spend.py", head: 40 }, lines.slice(0, 40).join("\n"));
    expect(small).not.toContain("Outline");
    const notes = await read({ path: "/p/notes.md" }, file);
    expect(notes).not.toContain("Outline");
  });

  it("runs a whole call even when the reply's text copied a removal note", async () => {
    const onToolCallDetected = vi.fn().mockResolvedValue({
      success: true,
      data: "a.md",
    });
    await processMCPToolCalls(
      {
        id: "assistant-noted",
        role: "assistant",
        content:
          'Let me check the folder:\n\n[SHILD removed from your context to save space: 247 characters of the call above. The call already ran.]\n\n<tool_call>\n<server>filesystem</server>\n<tool>list_directory</tool>\n<arguments>{"path":"/p"}</arguments>\n</tool_call>',
        timestamp: new Date(),
      },
      {
        onToolCallDetected,
        addMessage: vi.fn(),
        continueConversation: vi.fn().mockResolvedValue("ok"),
        maxToolRounds: 3,
      }
    );
    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
  });

  it("refuses a call whose arguments carry a removal note", async () => {
    const onToolCallDetected = vi.fn();
    const addMessage = vi.fn();
    await processMCPToolCalls(
      {
        id: "assistant-in-args",
        role: "assistant",
        content:
          '<tool_call>\n<server>terminal</server>\n<tool>run_command</tool>\n<arguments>{"command":"[SHIELD removed from your context to save space: 90 characters of the call above.]"}</arguments>\n</tool_call>',
        timestamp: new Date(),
      },
      {
        onToolCallDetected,
        addMessage,
        continueConversation: vi.fn().mockResolvedValue("ok"),
        maxToolRounds: 3,
      }
    );
    expect(onToolCallDetected).not.toHaveBeenCalled();
    expect((addMessage.mock.calls[0]?.[0] as Message).content).toContain(
      "copied one of SHIELD's notes"
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
      .mockResolvedValueOnce("It was too long for one reply.");

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

  it("asks once for the call a reply announced after a result", async () => {
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: { content: "# Kit" } });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(
        "The file ends with the pet supplies. I'll append the new section at the end of the file."
      )
      .mockResolvedValueOnce(
        call("append_file", '{"path":"C:/a.md","content":"## LI"}')
      )
      .mockResolvedValueOnce("Added. Let me read it again to check.")
      .mockResolvedValueOnce("Unused");

    await processMCPToolCalls(
      {
        id: "assistant-announce",
        role: "assistant",
        content: call("read_text_file", '{"path":"C:/a.md"}'),
        timestamp: new Date(),
      },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected.mock.calls.map((c) => c[0]?.tool)).toEqual([
      "read_text_file",
      "append_file",
    ]);
    expect(continueConversation.mock.calls[1]?.[0]).toMatch(
      /made no tool call/
    );
    // Once per turn: the second announcement ends it
    expect(continueConversation).toHaveBeenCalledTimes(3);
  });

  it("leaves a closing answer after a result alone", async () => {
    const continueConversation = vi
      .fn()
      .mockResolvedValue(
        "The write was declined, so the file is unchanged. I'll let you know if anything else comes up. Let me know if you want another try."
      );

    await processMCPToolCalls(
      {
        id: "assistant-closing",
        role: "assistant",
        content: call("write_file", '{"path":"C:/a.md","content":"x"}'),
        timestamp: new Date(),
      },
      {
        onToolCallDetected: vi
          .fn()
          .mockResolvedValue({ success: false, error: "denied" }),
        addMessage: vi.fn(),
        continueConversation,
      }
    );

    expect(continueConversation).toHaveBeenCalledTimes(1);
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

  it("ends the turn when the model keeps repeating a call", async () => {
    // Gemma, thinking off: one mistyped listing, 20 times (2026-09-26)
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: false, error: "Access denied" });
    const continueConversation = vi.fn().mockResolvedValue(listing);
    const added: { content: string }[] = [];

    await processMCPToolCalls(
      { id: "s", role: "assistant", content: listing, timestamp: new Date() },
      {
        onToolCallDetected,
        addMessage: (message) => added.push(message),
        continueConversation,
      }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    // The first call, then three answers from memory: the model is not
    // asked a fourth time
    expect(continueConversation).toHaveBeenCalledTimes(3);
    expect(added.at(-1)?.content).toContain(
      "kept repeating the same step (list_directory C:/notes)"
    );
  });

  // Live (2026-10-25): the same delegate call three times after a run that
  // changed nothing, each answered with the same cached report
  it("answers a repeated delegation with what to do, not the old report", async () => {
    const delegate = call("delegate", '{"role":"coder","task":"fix calc.py"}');
    const onToolCallDetected = vi.fn().mockResolvedValue({
      success: true,
      data: "[coder · DONE · 2 steps] files: none changed",
      changed: false,
    });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(delegate)
      .mockResolvedValueOnce("I could not make the change.");

    await processMCPToolCalls(
      { id: "d", role: "assistant", content: delegate, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    const second = continueConversation.mock.calls[1]?.[0] as string;
    expect(second).toContain("already gave the coder exactly this task");
    expect(second).toContain("what the agent lacked");
    expect(second).not.toContain("files: none changed");
  });

  // delegate counts as read-only, but its agent may change files: a tester
  // sent the same task after a coder's fix has to run again
  it("runs a repeated call again after a delegation changed something", async () => {
    const test = call("delegate", '{"role":"tester","task":"run the tests"}');
    const fix = call("delegate", '{"role":"coder","task":"fix calc.py"}');
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: true, data: "report", changed: true });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(fix)
      .mockResolvedValueOnce(test)
      .mockResolvedValueOnce("The tests pass now.");

    await processMCPToolCalls(
      { id: "t", role: "assistant", content: test, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(3);
  });

  // A rewrite SHIELD sends back once has to go through when sent again
  it("does not answer a call sent back before it ran from memory", async () => {
    const write = call("write_file", '{"path":"C:/a.js","content":"x"}');
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: "Not run: C:/a.js already exists (9,000 characters).",
      })
      .mockResolvedValueOnce({ success: true, data: "Successfully wrote" });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(write)
      .mockResolvedValueOnce("Rewrote a.js.");

    await processMCPToolCalls(
      { id: "b1", role: "assistant", content: write, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(2);
  });

  it("still ends the turn when the same call keeps being sent back", async () => {
    const write = call("write_file", '{"path":"C:/a.js","content":"x"}');
    const onToolCallDetected = vi.fn().mockResolvedValue({
      success: false,
      error: "Not run: the text you sent is SHIELD's note",
    });
    const continueConversation = vi.fn().mockResolvedValue(write);
    const added: { content: string }[] = [];

    await processMCPToolCalls(
      { id: "b2", role: "assistant", content: write, timestamp: new Date() },
      {
        onToolCallDetected,
        addMessage: (message) => added.push(message),
        continueConversation,
      }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(3);
    expect(added.at(-1)?.content).toContain("kept repeating the same step");
  });

  // An orchestrator sent one unreadable delegate call eleven times, 2026-10-22
  it("ends the turn when the same unreadable call keeps coming", async () => {
    // A task string cut off in the middle: no repair can close it
    const bad =
      '<tool_call>\n<server>agents</server>\n<tool>delegate</tool>\n<arguments>{"role":"coder" "task":"Fix it"}</arguments>\n</tool_call>';
    const onToolCallDetected = vi.fn();
    const continueConversation = vi.fn().mockResolvedValue(bad);
    const added: { content: string }[] = [];

    await processMCPToolCalls(
      { id: "u1", role: "assistant", content: bad, timestamp: new Date() },
      {
        onToolCallDetected,
        addMessage: (message) => added.push(message),
        continueConversation,
      }
    );

    expect(onToolCallDetected).not.toHaveBeenCalled();
    expect(continueConversation).toHaveBeenCalledTimes(2);
    expect(added.at(-1)?.content).toContain(
      "kept sending a delegate call that could not be read"
    );
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
    const repeat = continueConversation.mock.calls[1]?.[0] as string;
    expect(repeat).toContain("already refused");
    expect(repeat).toContain("denied");
    expect(repeat).not.toContain("result you already have");
  });

  // Seen in the app, 2026-09-27: told to "use the result you already have"
  // after a failed edit, Qwen3-Coder reported the fix as applied.
  it("reports a repeated failed call as failed", async () => {
    const edit = call(
      "edit_file",
      '{"path":"C:/set-radio.ps1","edits":[{"oldText":"a","newText":"b"}]}'
    );
    const onToolCallDetected = vi.fn().mockResolvedValue({
      success: false,
      error: "Could not find exact match for edit",
    });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(edit)
      .mockResolvedValueOnce("The change was not made.");

    await processMCPToolCalls(
      { id: "d", role: "assistant", content: edit, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    const repeat = continueConversation.mock.calls[1]?.[0] as string;
    expect(repeat).toContain("already failed");
    expect(repeat).toContain("Could not find exact match");
    expect(repeat).toContain("tell the user this change was not made");
    expect(repeat).not.toContain("result you already have");
  });

  it("does not ask again for a call the user declined", async () => {
    const write = call("write_file", '{"path":"C:/r.txt","content":"x"}');
    const onToolCallDetected = vi
      .fn()
      .mockResolvedValue({ success: false, error: "User denied permission" });
    const continueConversation = vi
      .fn()
      .mockResolvedValueOnce(write)
      .mockResolvedValueOnce("I did not create it.");

    await processMCPToolCalls(
      { id: "e", role: "assistant", content: write, timestamp: new Date() },
      { onToolCallDetected, addMessage: vi.fn(), continueConversation }
    );

    expect(onToolCallDetected).toHaveBeenCalledTimes(1);
    const repeat = continueConversation.mock.calls[1]?.[0] as string;
    expect(repeat).toContain("already declined");
    expect(repeat).toContain("tell the user it was not done");
  });
});

// Seen in the app, 2026-09-22: "read the index and find bugs" read
// {"path":"index.html"} and then {"path":"C:\...\EXPERIMENT\index.html"},
// and the repeat check treated them as different calls.
describe("callSignature on Windows paths", () => {
  const ws = String.raw`C:\Users\me\Projects\EXPERIMENT`;
  const call = (path: string) => ({
    serverName: "filesystem",
    tool: "read_text_file",
    arguments: { path },
  });

  it("treats relative and absolute paths to the same file as one call", () => {
    const relative = callSignature(call("index.html"), ws, "windows");
    expect(
      callSignature(call(String.raw`${ws}\index.html`), ws, "windows")
    ).toBe(relative);
    expect(callSignature(call("./index.html"), ws, "windows")).toBe(relative);
    const forwardSlashes = ws.split("\\").join("/");
    expect(
      callSignature(call(`${forwardSlashes}/INDEX.html`), ws, "windows")
    ).toBe(relative);
  });

  it("treats '.' as the workspace itself", () => {
    const listing = (path: string) => ({
      serverName: "filesystem",
      tool: "list_directory",
      arguments: { path },
    });
    expect(callSignature(listing("."), ws, "windows")).toBe(
      callSignature(listing(ws), ws, "windows")
    );
  });

  it("keeps different files and different tools apart", () => {
    expect(callSignature(call("a.md"), ws, "windows")).not.toBe(
      callSignature(call("b.md"), ws, "windows")
    );
    expect(callSignature(call("a.md"), ws, "windows")).not.toBe(
      callSignature({ ...call("a.md"), tool: "get_file_info" }, ws, "windows")
    );
  });

  it("answers the relative-then-absolute reread from memory", async () => {
    vi.stubGlobal("navigator", { platform: "Win32", userAgent: "" });
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
    vi.unstubAllGlobals();
  });
});

describe("callTarget", () => {
  it("is the role for a delegation", () => {
    expect(
      callTarget({
        serverName: "agents",
        tool: "delegate",
        arguments: { role: " Coder ", task: "x" },
      })
    ).toBe("coder");
    expect(
      callTarget({
        serverName: "agents",
        tool: "delegate",
        arguments: { task: "x" },
      })
    ).toBeUndefined();
  });
  it("is still the path, query, url or command for other tools", () => {
    expect(
      callTarget({
        serverName: "filesystem",
        tool: "read_text_file",
        arguments: { path: "/a" },
      })
    ).toBe("/a");
    expect(
      callTarget({
        serverName: "terminal",
        tool: "run_command",
        arguments: { command: "ls" },
      })
    ).toBe("ls");
  });
});

describe("callSignature on Linux and macOS paths", () => {
  const ws = "/home/me/projects/app";
  const call = (path: string, tool = "read_text_file") => ({
    serverName: "filesystem",
    tool,
    arguments: { path },
  });
  const sig = (path: string, tool?: string) =>
    callSignature(call(path, tool), ws, "linux");

  it("treats relative and absolute paths to the same file as one call", () => {
    const relative = sig("index.html");
    expect(sig(`${ws}/index.html`)).toBe(relative);
    expect(sig("./index.html")).toBe(relative);
    expect(sig("src/../index.html")).toBe(relative);
    expect(sig(`${ws}//index.html`)).toBe(relative);
  });

  it("treats '.' as the workspace itself", () => {
    expect(sig(".", "list_directory")).toBe(sig(ws, "list_directory"));
    expect(sig(`${ws}/`, "list_directory")).toBe(sig(ws, "list_directory"));
  });

  it("keeps files whose names differ only in case apart", () => {
    expect(sig("README.md")).not.toBe(sig("readme.md"));
  });

  it("keeps different files and different tools apart", () => {
    expect(sig("a.md")).not.toBe(sig("b.md"));
    expect(sig("a.md")).not.toBe(sig("a.md", "get_file_info"));
  });

  it("does not let '..' climb out of the root", () => {
    expect(canonicalPath("/../../etc/passwd", ws, "linux")).toBe("/etc/passwd");
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

describe("the same error again", () => {
  // LFM3 1.7B's crash in the complex task (2026-11-10)
  const crash = (seconds: string) =>
    `Exit code 1 · ${seconds} s\nTraceback (most recent call last):\n  File "/p/kitplan.py", line 264, in <module>\n    main()\n  File "/p/kitplan.py", line 109, in build_parser\n    subparsers.add_parser("summary", dest="x")\n  File "/usr/lib/python3.14/argparse.py", line 1269, in add_parser\n    raise ValueError(f'conflicting subparser: {name}')\nValueError: conflicting subparser: summary`;

  it("reads the failure and where the project's code raised it", () => {
    expect(failureSignature(crash("0.1"))).toBe(failureSignature(crash("0.3")));
    expect(failureSignature("Exit code 0 · 0.1 s\nok")).toBeNull();
    expect(tracebackPlace(crash("0.1"))).toBe("line 109 of kitplan.py");
  });

  it("says so when a command ends with the same error and nothing was edited", async () => {
    const call = (tool: string, args: Record<string, unknown>) =>
      `<tool_call>\n<server>terminal</server>\n<tool>${tool}</tool>\n<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`;
    const replies = [
      call("run_command", { command: "python3 kitplan.py F search water", reason: "try" }),
      call("edit_file", { path: "/p/kitplan.py", edits: [{ oldText: "a", newText: "b" }] }),
      call("run_command", { command: "python3 kitplan.py F missing 1 3", reason: "try" }),
      "Done.",
    ];
    const onToolCallDetected = vi.fn(async (c: { tool: string }) =>
      c.tool === "run_command" ? { success: true, data: crash("0.1") } : { success: true, data: "Edited." }
    );
    const addMessage = vi.fn();
    let n = 0;
    await processMCPToolCalls(
      {
        id: "a-same-error",
        role: "assistant",
        content: call("run_command", { command: "python3 kitplan.py F summary", reason: "try" }),
        timestamp: new Date(),
      },
      {
        onToolCallDetected,
        addMessage,
        continueConversation: vi.fn(async () => replies[n++] ?? "Done."),
        maxToolRounds: 6,
      }
    );
    const results = addMessage.mock.calls
      .map((c) => (c[0] as Message).content)
      .filter((t) => t.includes("<tool_result"));
    expect(results[0]).not.toContain("same error");
    expect(results[1]).toContain("same error as an earlier command");
    expect(results[1]).toContain("raised at line 109 of kitplan.py");
    // After an edit the slate is clean
    expect(results[3]).not.toContain("same error");
  });
});
