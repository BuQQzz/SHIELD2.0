// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHistoryItem, LlamaChatSession } from "node-llama-cpp";
import type { ToolDefinition } from "../types/prompts";
import { extractToolCalls } from "../handlers/toolCallParsing";

const mocks = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("node-llama-cpp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node-llama-cpp")>()),
  LlamaChat: class {
    generateResponse = mocks.generateResponse;
    dispose = mocks.dispose;
  },
}));

const { NativeChatSession } = await import("./NativeChatSession");

const tool: ToolDefinition = {
  serverName: "filesystem",
  name: "read_text_file",
  description: "Read a file",
  parameters: [
    { name: "path", type: "string", required: true, description: "File path" },
  ],
};

function fixture() {
  let history: ChatHistoryItem[] = [{ type: "system", text: "Help the user." }];
  const session = {
    sequence: {},
    chatWrapper: {},
    getChatHistory: () => history,
    setChatHistory: (next: ChatHistoryItem[]) => {
      history = next;
    },
  } as unknown as LlamaChatSession;
  const native = new NativeChatSession(session);
  return { native, session };
}

function generateCall(path = "C:\\work\\notes.txt") {
  mocks.generateResponse.mockImplementationOnce(async (history) => ({
    response: `I'll read the file.<|tool_call>call:filesystem__read_text_file{path:<|"|>${path}<|"|>}`,
    lastEvaluation: {
      cleanHistory: [
        ...history.slice(0, -1),
        { type: "model", response: ["I'll read the file."] },
      ],
    },
    metadata: { stopReason: "customStopTrigger" },
  }));
}

function generateAnswer() {
  mocks.generateResponse.mockImplementationOnce(async (history) => ({
    response: "The file contains the requested notes.",
    lastEvaluation: { cleanHistory: history },
    metadata: { stopReason: "eogToken" },
  }));
}

beforeEach(() => vi.clearAllMocks());

describe("NativeChatSession", () => {
  it("yields a validated call to the existing permission loop and resumes with its native result", async () => {
    const { native, session } = fixture();
    generateCall();
    const output = await native.prompt("Read notes.txt", [tool], {});
    const [call] = extractToolCalls(output.responseText);
    expect(call).toMatchObject({
      serverName: "filesystem",
      tool: "read_text_file",
      arguments: { path: "C:\\work\\notes.txt" },
    });
    expect(call?.callId).toMatch(/^native-/);
    expect(mocks.generateResponse.mock.calls[0]?.[1].functions).toBeUndefined();
    expect(
      mocks.generateResponse.mock.calls[0]?.[1].customStopTriggers
    ).toHaveLength(1);
    expect(session.getChatHistory().at(-1)).toEqual({
      type: "model",
      response: ["I'll read the file."],
    });

    generateAnswer();
    await native.prompt(
      "Legacy result prompt must not become a user turn",
      [tool],
      {},
      [{ callId: call!.callId!, result: "File contents: notes" }]
    );
    const resumedHistory = mocks.generateResponse.mock
      .calls[1]?.[0] as ChatHistoryItem[];
    expect(resumedHistory.filter((item) => item.type === "user")).toHaveLength(
      1
    );
    expect(resumedHistory.at(-1)).toMatchObject({
      type: "model",
      response: [
        "I'll read the file.",
        {
          type: "functionCall",
          params: { path: "C:\\work\\notes.txt" },
          result: "File contents: notes",
        },
      ],
    });
  });

  it("escapes embedded markup while preserving the original arguments", async () => {
    const { native } = fixture();
    generateCall("C:\\work\\<|tool_call>.txt");
    const output = await native.prompt("read", [tool], {});
    expect(output.responseText).not.toContain("<|tool_call>");
    expect(extractToolCalls(output.responseText)[0]?.arguments.path).toBe(
      "C:\\work\\<|tool_call>.txt"
    );
  });

  it("rejects stale or mismatched results without generating another response", async () => {
    const { native } = fixture();
    generateCall();
    await native.prompt("read", [tool], {});
    await expect(
      native.prompt("result", [tool], {}, [{ callId: "wrong", result: "done" }])
    ).rejects.toThrow("do not match");
    expect(mocks.generateResponse).toHaveBeenCalledTimes(1);
  });

  it("round-trips Markdown file contents containing nested code fences", async () => {
    const { native } = fixture();
    const markdown =
      "# Notes\n\n```ts\nconst ok = true;\n```\n\n<|tool_call> is text.";
    const writeTool: ToolDefinition = {
      ...tool,
      name: "write_file",
      parameters: [
        ...tool.parameters!,
        {
          name: "content",
          type: "string",
          required: true,
          description: "File text",
        },
      ],
    };
    mocks.generateResponse.mockImplementationOnce(async (history) => ({
      response: `<|tool_call>call:filesystem__write_file{path:<|"|>C:\\work\\notes.md<|"|>,content:<|"|>${markdown}<|"|>}`,
      lastEvaluation: { cleanHistory: history },
      metadata: { stopReason: "customStopTrigger" },
    }));
    const output = await native.prompt("Write notes", [writeTool], {});
    const calls = extractToolCalls(output.responseText);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.arguments).toEqual({
      path: "C:\\work\\notes.md",
      content: markdown,
    });
  });

  it("reports a cut-off native request without emitting an executable call", async () => {
    const { native } = fixture();
    mocks.generateResponse.mockImplementationOnce(async (history) => {
      return {
        response:
          "I'll read it.<|tool_call>call:filesystem__read_text_file{path:",
        lastEvaluation: { cleanHistory: history },
        metadata: { stopReason: "maxTokens" },
      };
    });
    const output = await native.prompt("read", [tool], {});
    expect(output.responseText).toContain("No tool from this reply was run");
    expect(extractToolCalls(output.responseText)).toEqual([]);
  });

  it("records denials as native results and does not claim success", async () => {
    const { native } = fixture();
    generateCall();
    const output = await native.prompt("read", [tool], {});
    const callId = extractToolCalls(output.responseText)[0]!.callId!;
    generateAnswer();
    await native.prompt("result", [tool], {}, [
      { callId, result: "Permission denied. The call was not run." },
    ]);
    expect(JSON.stringify(mocks.generateResponse.mock.calls[1]?.[0])).toContain(
      "Permission denied. The call was not run."
    );
  });

  it("suppresses split native markers during streaming", async () => {
    const { native } = fixture();
    const onTextChunk = vi.fn();
    const chunks = [
      "Let me check.<|to",
      'ol_call>call:filesystem__read_text_file{path:<|"|>C:\\work\\notes.txt<|"|>}',
    ];
    mocks.generateResponse.mockImplementationOnce(async (history, options) => {
      for (const chunk of chunks) options.onTextChunk(chunk);
      return {
        response: chunks.join(""),
        lastEvaluation: { cleanHistory: history },
        metadata: { stopReason: "customStopTrigger" },
      };
    });
    const output = await native.prompt("read", [tool], { onTextChunk });
    expect(onTextChunk.mock.calls.map(([text]) => text).join("")).toBe(
      "Let me check."
    );
    expect(extractToolCalls(output.responseText)).toHaveLength(1);
  });

  it("rejects unadvertised names and calls without a real native stop", async () => {
    for (const [name, stopReason, closer] of [
      ["filesystem__delete_file", "customStopTrigger", ""],
      ["filesystem__read_text_file", "eogToken", "<tool_call|>"],
    ]) {
      const { native } = fixture();
      mocks.generateResponse.mockImplementationOnce(async (history) => ({
        response: `<|tool_call>call:${name}{path:<|"|>C:\\work\\notes.txt<|"|>}${closer}`,
        lastEvaluation: { cleanHistory: history },
        metadata: { stopReason },
      }));
      const output = await native.prompt("read", [tool], {});
      expect(output.responseText).toContain("No tool from this reply was run");
      expect(extractToolCalls(output.responseText)).toHaveLength(0);
    }
  });

  it("keeps thoughts private while capturing a call at its native control boundary", async () => {
    const { native, session } = fixture();
    mocks.generateResponse.mockImplementationOnce(async (history) => ({
      response: "",
      fullResponse: [
        {
          type: "segment",
          segmentType: "thought",
          ended: false,
          text: 'Private reasoning.<|tool_call>call:filesystem__read_text_file{path:<|"|>C:\\work\\notes.txt<|"|>}',
        },
      ],
      lastEvaluation: { cleanHistory: history },
      metadata: { stopReason: "customStopTrigger" },
    }));
    const output = await native.prompt("read", [tool], {});
    expect(output.responseText).not.toContain("Private reasoning");
    expect(extractToolCalls(output.responseText)).toHaveLength(1);
    expect(JSON.stringify(session.getChatHistory())).not.toContain(
      "<|tool_call>"
    );
  });

  it("settles an abandoned request before a new user message", async () => {
    const { native } = fixture();
    generateCall();
    await native.prompt("read", [tool], {});
    generateAnswer();
    await native.prompt("Forget that and explain", [tool], {});
    const history = mocks.generateResponse.mock
      .calls[1]?.[0] as ChatHistoryItem[];
    expect(JSON.stringify(history)).toContain(
      "Do not assume it ran or succeeded"
    );
    expect(history.at(-2)).toEqual({
      type: "user",
      text: "Forget that and explain",
    });
  });

  it("stopping clears pending ids and rejects late results", async () => {
    const { native, session } = fixture();
    generateCall();
    const output = await native.prompt("read", [tool], {});
    const callId = extractToolCalls(output.responseText)[0]!.callId!;
    native.cancelPending();
    expect(JSON.stringify(session.getChatHistory())).toContain(
      "No result was received"
    );
    await expect(
      native.prompt("late result", [tool], {}, [{ callId, result: "done" }])
    ).rejects.toThrow("request ended");
  });

  it("does not publish pending calls after abort and disposes without freeing the shared sequence", async () => {
    const { native } = fixture();
    const controller = new AbortController();
    mocks.generateResponse.mockImplementationOnce(async () => {
      controller.abort();
      return {};
    });
    await expect(
      native.prompt("read", [tool], { signal: controller.signal })
    ).rejects.toThrow();
    native.dispose();
    expect(mocks.dispose).toHaveBeenCalledWith({ disposeSequence: false });
  });
});
