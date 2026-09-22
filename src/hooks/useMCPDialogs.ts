/**
 * MCP Permission Hook
 *
 * Owns the approve/deny workflow for MCP tool calls.
 *
 * Previously the pending promise was parked on `window._mcpToolResolve`, a
 * single global slot: a second request would overwrite the first, leaving the
 * earlier tool call hung forever with no error. The pending request now lives
 * in a ref alongside its resolver, so a request that arrives while another is
 * open is rejected explicitly rather than silently dropped.
 */

import { useState, useCallback, useRef } from "react";
import type { ToolCallRequest } from "@/handlers/mcpToolHandler";
import type { MCPToolResult } from "@/types/electron";
import { useSettingsStore } from "@/store/settingsStore";
import { isMutatingTool } from "@/config/toolClassification";
import type { ToolPolicy } from "@/hooks/useToolPolicy";

/** A tool call waiting on the user */
export interface PendingToolRequest {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  /** True when the call can change something on disk */
  isMutating: boolean;
  /** For write_file, the content that would be written */
  previewContent?: string;
  /** The path the call targets, when it has one */
  targetPath?: string;
}

interface UseMCPDialogsProps {
  callTool: (request: {
    serverName: string;
    tool: string;
    arguments: Record<string, unknown>;
  }) => Promise<MCPToolResult>;
  /** Decides which calls stop for a prompt and whether they run at all */
  policy: ToolPolicy;
}

export function useMCPDialogs({ callTool, policy }: UseMCPDialogsProps) {
  const [pendingRequest, setPendingRequest] =
    useState<PendingToolRequest | null>(null);
  /** The tool currently executing, so the UI can show it in flight */
  const [runningTool, setRunningTool] = useState<{
    tool: string;
    serverName: string;
  } | null>(null);
  const resolverRef = useRef<((result: MCPToolResult) => void) | null>(null);
  const { settings, updateSettings } = useSettingsStore();

  /** Settle the open request and clear it */
  const settle = useCallback((result: MCPToolResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setPendingRequest(null);
    resolve?.(result);
  }, []);

  /**
   * Entry point for every tool call the model makes.
   */
  const handleToolCallRequest = useCallback(
    async (toolCall: ToolCallRequest): Promise<MCPToolResult> => {
      const allowedTools = settings.mcp?.allowedTools ?? [];
      if (!allowedTools.includes(toolCall.tool)) {
        return {
          success: false,
          error: `Tool '${toolCall.tool}' is disabled in MCP tool settings`,
        };
      }

      const decision = policy.decide({ name: toolCall.tool });

      // Recorded as an intended step rather than performed. In plan mode this
      // is only ever a mutating tool - reads still run, so the plan can be
      // based on what is actually in the files.
      if (decision === "block") {
        return {
          success: false,
          blocked: true,
          error: policy.isPlanning
            ? `Plan mode: '${toolCall.tool}' was NOT executed and has been recorded as a step in your plan. Continue planning - you may still read files.`
            : `Read-only mode: '${toolCall.tool}' changes files, so it was NOT executed.`,
        };
      }

      // Reads in auto/plan/readonly run without interrupting the user
      if (decision === "run") {
        console.log(
          `[MCP] ${policy.mode} mode: running ${toolCall.tool} without prompting`
        );
        setRunningTool({
          tool: toolCall.tool,
          serverName: toolCall.serverName,
        });
        try {
          return await callTool({
            serverName: toolCall.serverName,
            tool: toolCall.tool,
            arguments: toolCall.arguments,
          });
        } finally {
          setRunningTool(null);
        }
      }

      // Only one request can be open at a time. Refuse rather than clobber.
      if (resolverRef.current) {
        return {
          success: false,
          error: "Another tool call is already awaiting permission",
        };
      }

      return new Promise<MCPToolResult>((resolve) => {
        resolverRef.current = resolve;
        setPendingRequest({
          serverName: toolCall.serverName,
          toolName: toolCall.tool,
          arguments: toolCall.arguments,
          isMutating: isMutatingTool({ name: toolCall.tool }),
          previewContent:
            typeof toolCall.arguments.content === "string"
              ? toolCall.arguments.content
              : undefined,
          targetPath:
            typeof toolCall.arguments.path === "string"
              ? toolCall.arguments.path
              : undefined,
        });
      });
    },
    [settings.mcp?.allowedTools, policy, callTool]
  );

  /**
   * User approved. `remember` promotes the tool so it stops asking.
   */
  const handleApprove = useCallback(
    async (remember: boolean) => {
      const request = pendingRequest;
      if (!request) return;

      if (remember) {
        // "Allow always" widens the allowlist, which the user can see and
        // revoke in Settings -> MCP. It does not change the permission mode.
        const current = settings.mcp?.allowedTools ?? [];
        if (!current.includes(request.toolName)) {
          await updateSettings({
            mcp: {
              ...settings.mcp,
              allowedTools: [...current, request.toolName],
            },
          });
        }
      }

      setRunningTool({
        tool: request.toolName,
        serverName: request.serverName,
      });

      try {
        const result = await callTool({
          serverName: request.serverName,
          tool: request.toolName,
          arguments: request.arguments,
        });
        console.log("[MCP] Tool result:", result);
        settle(result);
      } catch (error) {
        console.error("[MCP] Tool call failed:", error);
        settle({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setRunningTool(null);
      }
    },
    [pendingRequest, callTool, settings.mcp, updateSettings, settle]
  );

  /**
   * User declined.
   */
  const handleDeny = useCallback(() => {
    console.log("[MCP] User denied tool request");
    settle({ success: false, error: "User denied permission" });
  }, [settle]);

  return {
    pendingRequest,
    runningTool,
    handleToolCallRequest,
    handleApprove,
    handleDeny,
  };
}
