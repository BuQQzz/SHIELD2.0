import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useMCPSystemPrompt } from "./useMCPSystemPrompt";
import { resolveToolPolicy } from "./useToolPolicy";
import type { ToolDefinition } from "@/types/prompts";

afterEach(cleanup);

const read: ToolDefinition = {
  name: "read_text_file",
  serverName: "filesystem",
  description: "Read file contents",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
  },
};
const write: ToolDefinition = {
  name: "write_file",
  serverName: "filesystem",
  description: "Write file contents",
};
const baseProps = {
  isModelLoaded: true,
  isMCPReady: true,
  mcpEnabled: true,
  baseSystemPrompt: "You are SHIELD",
  modelName: "Gemma-4-12B-it",
  availableTools: [read, write],
  allowedPaths: ["C:\\workspace"],
};

describe("useMCPSystemPrompt native tools", () => {
  it("passes native definitions to the runtime and clears them when switching models", () => {
    const setSystemPrompt = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ modelName }) =>
        useMCPSystemPrompt({ ...baseProps, modelName, setSystemPrompt }),
      { initialProps: { modelName: "Gemma-4-12B-it" } }
    );

    expect(setSystemPrompt).toHaveBeenLastCalledWith(
      expect.stringContaining("native function call"),
      [read, write]
    );
    rerender({ modelName: "Gemma 3 12B" });
    expect(setSystemPrompt).toHaveBeenLastCalledWith(
      expect.stringContaining("<tool_call>"),
      []
    );
    rerender({ modelName: "Qwen3-Coder" });
    expect(setSystemPrompt).toHaveBeenLastCalledWith(
      expect.stringContaining("<tool_call>"),
      []
    );
  });

  it("clears native definitions when MCP is disabled or disconnected", () => {
    const setSystemPrompt = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ mcpEnabled, isMCPReady }) =>
        useMCPSystemPrompt({
          ...baseProps,
          mcpEnabled,
          isMCPReady,
          setSystemPrompt,
        }),
      { initialProps: { mcpEnabled: true, isMCPReady: true } }
    );
    rerender({ mcpEnabled: false, isMCPReady: true });
    expect(setSystemPrompt).toHaveBeenLastCalledWith(
      expect.not.stringContaining("native function call"),
      []
    );
    rerender({ mcpEnabled: true, isMCPReady: false });
    expect(setSystemPrompt).toHaveBeenLastCalledWith(
      expect.not.stringContaining("native function call"),
      []
    );
  });

  it("offers only reads in Plan mode, respecting annotation overrides", () => {
    const setSystemPrompt = vi.fn().mockResolvedValue(undefined);
    const inspection = {
      name: "inspect",
      description: "Inspect state",
      annotations: { readOnlyHint: true },
    };
    const mislabeledRead = { ...read, annotations: { readOnlyHint: false } };
    renderHook(() =>
      useMCPSystemPrompt({
        ...baseProps,
        availableTools: [read, write, inspection, mislabeledRead],
        planOnly: true,
        setSystemPrompt,
      })
    );

    expect(setSystemPrompt).toHaveBeenLastCalledWith(
      expect.stringContaining("Plan Mode"),
      [read, inspection]
    );
    expect(setSystemPrompt.mock.calls[0]?.[0]).not.toContain("<tool_call>");
  });

  it("does not add tools removed by the App policy's allowlist, web toggle, or read-only mode", () => {
    const setSystemPrompt = vi.fn().mockResolvedValue(undefined);
    const policy = resolveToolPolicy({
      mode: "readonly",
      allowedTools: [read.name, write.name],
      webSearchEnabled: false,
      serverTools: [
        read,
        write,
        { name: "list_directory", description: "Disabled" },
        { name: "web_search", serverName: "web", description: "Search" },
      ],
    });
    renderHook(() =>
      useMCPSystemPrompt({
        ...baseProps,
        availableTools: policy.advertisedTools,
        setSystemPrompt,
      })
    );

    expect(setSystemPrompt).toHaveBeenLastCalledWith(expect.any(String), [
      read,
    ]);
  });

  it("adds the project's AGENTS.md after the rest of the prompt", () => {
    const setSystemPrompt = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useMCPSystemPrompt({
        ...baseProps,
        availableTools: [read],
        projectInstructions: "Run the tests with node test.js",
        setSystemPrompt,
      })
    );
    const prompt = setSystemPrompt.mock.calls.at(-1)?.[0] as string;
    expect(prompt).toMatch(
      /## Project instructions \(the project's AGENTS\.md\)[\s\S]*Run the tests with node test\.js$/
    );
  });

  it("waits for the model and tool list before publishing a native prompt", () => {
    const setSystemPrompt = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ isModelLoaded, toolsLoading }) =>
        useMCPSystemPrompt({
          ...baseProps,
          isModelLoaded,
          toolsLoading,
          setSystemPrompt,
        }),
      { initialProps: { isModelLoaded: false, toolsLoading: false } }
    );
    expect(setSystemPrompt).not.toHaveBeenCalled();
    rerender({ isModelLoaded: true, toolsLoading: true });
    expect(setSystemPrompt).not.toHaveBeenCalled();
    rerender({ isModelLoaded: true, toolsLoading: false });
    expect(setSystemPrompt).toHaveBeenLastCalledWith(expect.any(String), [
      read,
      write,
    ]);
  });
});
