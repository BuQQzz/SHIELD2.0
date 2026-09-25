import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useLlama } from "./useLlama";
import type { ModelConfig } from "@/types/electron";

const qwen: ModelConfig = {
  id: "qwen3-coder-30b",
  name: "Qwen3-Coder-30B-A3B-Instruct",
  uri: "hf:unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
  contextSize: 32768,
  allowLowMemory: true,
};

/** The preload bridge, as the main process would answer after a reload */
function mockBridge(state: {
  loaded: boolean;
  info: ModelConfig | null;
  failQuestion?: boolean;
}) {
  const llama = {
    initialize: vi.fn().mockResolvedValue({ success: true }),
    isModelLoaded: state.failQuestion
      ? vi.fn().mockRejectedValue(new Error("no handler"))
      : vi.fn().mockResolvedValue({ success: true, loaded: state.loaded }),
    getModelInfo: vi
      .fn()
      .mockResolvedValue({ success: true, info: state.info }),
    stopGeneration: vi.fn().mockResolvedValue({ success: true }),
    getContextUsage: vi
      .fn()
      .mockResolvedValue({ success: true, context: null }),
  };
  Object.defineProperty(window, "llama", {
    value: llama,
    configurable: true,
    writable: true,
  });
  return llama;
}

afterEach(() => {
  delete (window as { llama?: unknown }).llama;
});

describe("useLlama after a window reload", () => {
  it("adopts the model the main process still holds", async () => {
    const llama = mockBridge({ loaded: true, info: qwen });

    const { result } = renderHook(() => useLlama());
    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.isModelLoaded).toBe(true);
    // Only what a load from this page would have recorded
    expect(result.current.currentModel).toEqual({
      id: qwen.id,
      name: qwen.name,
      uri: qwen.uri,
      contextSize: qwen.contextSize,
    });
    // The previous page's reply, if any, is not left holding the model
    expect(llama.stopGeneration).toHaveBeenCalledTimes(1);
  });

  it("starts without a model when none is loaded", async () => {
    const llama = mockBridge({ loaded: false, info: null });

    const { result } = renderHook(() => useLlama());
    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.isModelLoaded).toBe(false);
    expect(result.current.currentModel).toBeNull();
    expect(llama.stopGeneration).not.toHaveBeenCalled();
  });

  it("ignores the info of a server that has stopped", async () => {
    // llama-server exited: the runtime still remembers its model
    mockBridge({ loaded: false, info: qwen });

    const { result } = renderHook(() => useLlama());
    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.isModelLoaded).toBe(false);
  });

  it("still starts when the question fails", async () => {
    mockBridge({ loaded: true, info: qwen, failQuestion: true });

    const { result } = renderHook(() => useLlama());
    await waitFor(() => expect(result.current.isInitialized).toBe(true));

    expect(result.current.isModelLoaded).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
