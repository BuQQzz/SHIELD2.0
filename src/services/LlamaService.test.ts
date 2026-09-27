// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { ChatHistoryItem } from "node-llama-cpp";
import { extractToolCalls } from "../handlers/toolCallParsing";

const native = vi.hoisted(() => ({
  generateResponse: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("node-llama-cpp", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node-llama-cpp")>()),
  LlamaChat: class {
    generateResponse = native.generateResponse;
    dispose = native.dispose;
  },
}));

const { LlamaService, gemmaThoughtBudget } = await import("./LlamaService");

describe("LlamaService.cleanup", () => {
  it("frees the model even when freeing the context fails", async () => {
    const service = new LlamaService();
    const context = {
      dispose: vi.fn().mockRejectedValue(new Error("context busy")),
    };
    const model = { dispose: vi.fn().mockResolvedValue(undefined) };
    Object.assign(service, { context, model });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await service.cleanup();

    expect(context.dispose).toHaveBeenCalled();
    expect(model.dispose).toHaveBeenCalled();
    expect(service.isModelLoaded()).toBe(false);
  });
});

describe("LlamaService.chat", () => {
  function makeSequence() {
    return {
      tokenMeter: { usedOutputTokens: 0, usedInputTokens: 0 },
      nextTokenIndex: 0,
      contextSize: 8192,
    };
  }

  it("reports hidden Gemma thought progress and stops an unsupported native tool call", async () => {
    const service = new LlamaService();
    const sequence = makeSequence();
    const onToken = vi.fn();
    const onProgress = vi.fn();
    const promptWithMeta = vi.fn(
      async (
        _message: string,
        options: {
          budgets?: { thoughtTokens: number };
          onResponseChunk?: () => void;
          onTextChunk?: (text: string) => void;
          signal?: AbortSignal;
        }
      ) => {
        sequence.tokenMeter.usedOutputTokens = 10;
        options.onResponseChunk?.();
        options.onTextChunk?.("<|tool_call>call:");
        expect(options.signal?.aborted).toBe(true);
        throw options.signal?.reason;
      }
    );
    Object.assign(service, {
      session: { sequence, promptWithMeta },
      currentModelConfig: { id: "gemma-4-12b" },
    });

    await expect(
      service.chat("check this folder", {
        maxTokens: 8192,
        onToken,
        onProgress,
      })
    ).resolves.toBe("<|tool_call>call:");

    // Per reply, and room to finish a thought (2026-09-26)
    expect(promptWithMeta.mock.calls[0]?.[1].budgets).toEqual({
      thoughtTokens: 2048,
      includeCurrentResponse: false,
    });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "writing", generated: 10 })
    );
    expect(onToken).toHaveBeenCalledWith("<|tool_call>call:");
  });

  it("returns the visible response for a normal chat reply", async () => {
    const service = new LlamaService();
    const sequence = makeSequence();
    const promptWithMeta = vi.fn().mockResolvedValue({
      responseText: "Hello!",
      stopReason: "eogToken",
    });
    Object.assign(service, {
      session: { sequence, promptWithMeta },
      currentModelConfig: { id: "qwen3-coder-30b" },
    });

    await expect(service.chat("hi")).resolves.toBe("Hello!");
    expect(promptWithMeta.mock.calls[0]?.[1].budgets).toBeUndefined();
  });

  it("routes configured Gemma tools through native generation and keeps progress alive", async () => {
    const service = new LlamaService();
    const sequence = makeSequence();
    const onProgress = vi.fn();
    const promptWithMeta = vi.fn();
    let history: ChatHistoryItem[] = [{ type: "system", text: "Use tools." }];
    Object.assign(service, {
      session: {
        sequence,
        promptWithMeta,
        chatWrapper: {},
        getChatHistory: () => history,
        setChatHistory: (next: ChatHistoryItem[]) => {
          history = next;
        },
      },
      currentModelConfig: { id: "gemma-4-12b" },
    });
    await service.applySystemPrompt("Use tools.", [
      {
        name: "read_text_file",
        description: "Read file",
        serverName: "filesystem",
        parameters: [
          { name: "path", type: "string", required: true, description: "Path" },
        ],
      },
    ]);
    native.generateResponse.mockImplementationOnce(
      async (currentHistory, options) => {
        // Counted per reply: over a turn's rounds it ran out by the third
        expect(options.budgets).toEqual({
          thoughtTokens: 256,
          includeCurrentResponse: false,
        });
        sequence.tokenMeter.usedOutputTokens = 20;
        options.onResponseChunk();
        return {
          response:
            '<|tool_call>call:filesystem__read_text_file{path:<|"|>C:\\work\\notes.txt<|"|>}',
          metadata: { stopReason: "customStopTrigger" },
          lastEvaluation: { cleanHistory: currentHistory },
        };
      }
    );
    const reply = await service.chat("Read notes", { onProgress });
    expect(extractToolCalls(reply)[0]).toMatchObject({
      tool: "read_text_file",
    });
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ generated: 20 })
    );
    expect(promptWithMeta).not.toHaveBeenCalled();
    service.stopGeneration();
    expect(JSON.stringify(history)).toContain(
      "Do not assume it ran or succeeded"
    );
    service.clearHistory();
    expect(native.dispose).toHaveBeenCalledWith({ disposeSequence: false });
    expect(history).toEqual([{ type: "system", text: "Use tools." }]);
  });

  it("changes the prompt on the same sequence while preserving native tool results", async () => {
    const service = new LlamaService();
    let history: ChatHistoryItem[] = [
      { type: "system", text: "Old prompt" },
      {
        type: "model",
        response: [
          {
            type: "functionCall",
            name: "read",
            params: {},
            result: "Existing result",
          },
        ],
      },
    ];
    const sequence = makeSequence();
    const getSequence = vi.fn();
    Object.assign(service, {
      context: { getSequence },
      model: {},
      session: {
        sequence,
        getChatHistory: () => history,
        setChatHistory: (next: ChatHistoryItem[]) => {
          history = next;
        },
      },
    });
    await service.applySystemPrompt("New prompt");
    expect(history[0]).toEqual({ type: "system", text: "New prompt" });
    expect(JSON.stringify(history)).toContain("Existing result");
    expect(getSequence).not.toHaveBeenCalled();
  });

  it("restores the chat history after title generation", async () => {
    const service = new LlamaService();
    const original: ChatHistoryItem[] = [
      { type: "system", text: "Help" },
      { type: "model", response: ["Existing reply"] },
    ];
    let history = original;
    Object.assign(service, {
      session: {
        getChatHistory: () => history,
        setChatHistory: (next: ChatHistoryItem[]) => {
          history = next;
        },
        prompt: async () => {
          history = [...history, { type: "user", text: "Title prompt" }];
          return "Reading project files";
        },
      },
    });
    expect(await service.generateTitle("Read my project files")).toBe(
      "Reading project files"
    );
    expect(history).toEqual(original);
  });
});

describe("gemmaThoughtBudget", () => {
  it("leaves half the reply for the answer, up to 2,048 tokens of thought", () => {
    expect(gemmaThoughtBudget(8192)).toBe(2048);
    expect(gemmaThoughtBudget(2048)).toBe(1024);
    expect(gemmaThoughtBudget(1)).toBe(1);
  });
});
