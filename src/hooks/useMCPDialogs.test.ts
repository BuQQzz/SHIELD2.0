import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useMCPDialogs } from "./useMCPDialogs";
import { useSettingsStore } from "@/store/settingsStore";
import { useConversationStore } from "@/stores/conversation-store";
import { DEFAULT_SETTINGS } from "@/types/settings";
import type { ToolPolicy } from "./useToolPolicy";
import type { MCPToolResult } from "@/types/electron";

const WORKSPACE = String.raw`C:\Users\me\wifi`;

/** Auto-mode-like policy: everything runs except commands, which ask */
const policy: ToolPolicy = {
  advertisedTools: [
    {
      name: "write_file",
      description: "",
      serverName: "filesystem",
      parameters: [],
    },
    {
      name: "run_command",
      description: "",
      serverName: "terminal",
      parameters: [],
    },
  ],
  allows: () => true,
  decide: (call) => (call.name === "run_command" ? "ask" : "run"),
  isPlanning: false,
  mode: "auto",
};

const text = (value: string): MCPToolResult => ({
  success: true,
  data: { content: [{ type: "text", text: value }] },
});

const request = (tool: string, args: Record<string, unknown>) => ({
  serverName: "filesystem",
  tool,
  arguments: args,
});

describe("useMCPDialogs - commands", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        mcp: { ...DEFAULT_SETTINGS.mcp, workspaceFolder: WORKSPACE },
      },
    });
  });
  afterEach(cleanup);

  // Seen 2026-09-28: approving `powershell -File integration-test.ps1`
  // approved a script the model had just written, which ran set-radio.ps1
  it("shows the reason, and a script the model wrote, before asking", async () => {
    const script = ". .\\set-radio.ps1";
    const callTool = vi.fn(async (call: { tool: string }) =>
      call.tool === "read_text_file" ? text(script) : text("Successfully wrote")
    );
    const { result } = renderHook(() => useMCPDialogs({ callTool, policy }));

    await act(async () => {
      await result.current.handleToolCallRequest(
        request("write_file", {
          path: `${WORKSPACE}\\integration-test.ps1`,
          content: script,
        })
      );
    });

    let pending: Promise<MCPToolResult> | undefined;
    act(() => {
      pending = result.current.handleToolCallRequest(
        request("run_command", {
          command: "powershell -File .\\integration-test.ps1",
          reason: "Runs the integration test",
        })
      );
    });

    await waitFor(() => expect(result.current.pendingRequest).not.toBeNull());
    expect(result.current.pendingRequest).toMatchObject({
      command: "powershell -File .\\integration-test.ps1",
      commandReason: "Runs the integration test",
      modelScripts: [{ path: ".\\integration-test.ps1", content: script }],
    });

    act(() => result.current.handleDeny());
    await expect(pending).resolves.toMatchObject({ success: false });
  });

  it("names no script the model did not write", async () => {
    const callTool = vi.fn(async () => text("ok"));
    const { result } = renderHook(() => useMCPDialogs({ callTool, policy }));

    act(() => {
      void result.current.handleToolCallRequest(
        request("run_command", {
          command: ".\\set-radio.ps1",
          reason: "Runs set-radio.ps1",
        })
      );
    });

    await waitFor(() => expect(result.current.pendingRequest).not.toBeNull());
    expect(result.current.pendingRequest?.modelScripts).toBeUndefined();
    expect(callTool).not.toHaveBeenCalled();
    act(() => result.current.handleDeny());
  });

  it("finds a script the model wrote earlier in the saved conversation", async () => {
    useConversationStore.setState({
      currentConversation: {
        id: "c1",
        title: "t",
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          {
            id: "r1",
            role: "user",
            content:
              '<tool_result trusted="false">\n<tool>write_file</tool>\n<result>\nSuccessfully wrote\n</result>\n</tool_result>',
            timestamp: new Date(),
            toolResult: {
              tool: "write_file",
              serverName: "filesystem",
              success: true,
              target: "test-scripts.ps1",
            },
          },
        ],
      } as never,
    });
    const callTool = vi.fn(async () => text("Write-Host hi"));
    const { result } = renderHook(() => useMCPDialogs({ callTool, policy }));

    act(() => {
      void result.current.handleToolCallRequest(
        request("run_command", {
          command: "pwsh -File test-scripts.ps1",
          reason: "Runs the tests",
        })
      );
    });

    await waitFor(() => expect(result.current.pendingRequest).not.toBeNull());
    expect(result.current.pendingRequest?.modelScripts).toEqual([
      { path: "test-scripts.ps1", content: "Write-Host hi" },
    ]);
    act(() => result.current.handleDeny());
    useConversationStore.setState({ currentConversation: null });
  });

  // Seen 2026-09-28: Qwen3-Coder asked to run set-radio.ps1, which switches
  // the Wi-Fi radio, with no word about what it does
  it("sends a command back without asking when it has no reason", async () => {
    const callTool = vi.fn(async () => text("ok"));
    const { result } = renderHook(() => useMCPDialogs({ callTool, policy }));

    let outcome: MCPToolResult | undefined;
    await act(async () => {
      outcome = await result.current.handleToolCallRequest(
        request("run_command", { command: ".\\set-radio.ps1" })
      );
    });

    expect(outcome).toMatchObject({ success: false });
    expect(outcome?.error).toMatch(/^Not run: .*must include "reason"/);
    expect(result.current.pendingRequest).toBeNull();
    expect(callTool).not.toHaveBeenCalled();
  });

  it("runs an approved call once, however often Allow is clicked", async () => {
    const callTool = vi.fn(async () => text("Exit code 0 · 0.1 s\nok"));
    const { result } = renderHook(() => useMCPDialogs({ callTool, policy }));
    let pending: Promise<MCPToolResult> | undefined;
    act(() => {
      pending = result.current.handleToolCallRequest(
        request("run_command", { command: "npm test", reason: "Runs tests" })
      );
    });
    await waitFor(() => expect(result.current.pendingRequest).not.toBeNull());
    await act(async () => {
      await Promise.all([
        result.current.handleApprove(false),
        result.current.handleApprove(false),
      ]);
    });
    await expect(pending).resolves.toMatchObject({ success: true });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it("never offers a command for the session", async () => {
    const callTool = vi.fn(async () => text("Exit code 0 · 0.1 s\nok"));
    const { result } = renderHook(() => useMCPDialogs({ callTool, policy }));
    const ask = () =>
      act(() => {
        void result.current.handleToolCallRequest(
          request("run_command", { command: "npm test", reason: "Runs tests" })
        );
      });

    ask();
    await waitFor(() => expect(result.current.pendingRequest).not.toBeNull());
    await act(async () => {
      await result.current.handleApprove(true);
    });

    ask();
    await waitFor(() => expect(result.current.pendingRequest).not.toBeNull());
    act(() => result.current.handleDeny());
  });
});
