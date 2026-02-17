/**
 * MCP Dialog Management Hook
 *
 * Manages MCP permission dialogs and tool call approval/denial workflow
 */

import { useState, useCallback } from "react";
import type { PermissionRequest } from "@/components/dialogs/PermissionDialog";
import type { WriteFileRequest } from "@/components/dialogs/WriteFileDialog";
import type { ToolCallRequest } from "@/handlers/mcpToolHandler";
import type { MCPToolResult } from "@/types/electron";
import { useSettingsStore } from "@/store/settingsStore";

interface UseMCPDialogsProps {
  callTool: (request: {
    serverName: string;
    tool: string;
    arguments: Record<string, unknown>;
  }) => Promise<MCPToolResult>;
}

export function useMCPDialogs({ callTool }: UseMCPDialogsProps) {
  const [permissionRequest, setPermissionRequest] =
    useState<PermissionRequest | null>(null);
  const [writeFileRequest, setWriteFileRequest] =
    useState<WriteFileRequest | null>(null);
  const { settings } = useSettingsStore();

  /**
   * Handle tool call requests - routes to appropriate dialog
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

      return new Promise((resolve) => {
        // Check if this is a write_file operation
        if (toolCall.tool === "write_file") {
          const path = toolCall.arguments.path as string;
          const content = toolCall.arguments.content as string;

          // Show WriteFileDialog instead of generic PermissionDialog
          setWriteFileRequest({
            path,
            content,
            fileExists: false, // TODO: Check if file exists via IPC
          });

          // Store the resolve function
          window._mcpToolResolve = resolve;
        } else {
          // For read and list operations, use the generic PermissionDialog
          setPermissionRequest({
            serverName: toolCall.serverName,
            toolName: toolCall.tool,
            arguments: toolCall.arguments,
          });

          // Store the resolve function
          window._mcpToolResolve = resolve;
        }
      });
    },
    [settings.mcp?.allowedTools]
  );

  /**
   * Handle permission dialog approval
   */
  const handlePermissionApprove = useCallback(
    async (_remember: boolean) => {
      if (!permissionRequest) return;

      try {
        const result = await callTool({
          serverName: permissionRequest.serverName,
          tool: permissionRequest.toolName,
          arguments: permissionRequest.arguments || {},
        });

        console.log("[MCP] Tool result:", result);

        // Resolve the promise if one is waiting
        if (window._mcpToolResolve) {
          window._mcpToolResolve(result);
          delete window._mcpToolResolve;
        }
      } catch (error) {
        console.error("[MCP] Tool call failed:", error);

        // Resolve with error
        if (window._mcpToolResolve) {
          window._mcpToolResolve({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          delete window._mcpToolResolve;
        }
      } finally {
        setPermissionRequest(null);
      }
    },
    [permissionRequest, callTool]
  );

  /**
   * Handle permission dialog denial
   */
  const handlePermissionDeny = useCallback(() => {
    console.log("[MCP] User denied tool request");

    // Resolve with denial
    if (window._mcpToolResolve) {
      window._mcpToolResolve({
        success: false,
        error: "User denied permission",
      });
      delete window._mcpToolResolve;
    }

    setPermissionRequest(null);
  }, []);

  /**
   * Handle write file dialog approval
   */
  const handleWriteFileApprove = useCallback(
    async (_remember: boolean) => {
      if (!writeFileRequest) return;

      try {
        const result = await callTool({
          serverName: "filesystem",
          tool: "write_file",
          arguments: {
            path: writeFileRequest.path,
            content: writeFileRequest.content,
          },
        });

        console.log("[MCP] Write file result:", result);

        // Resolve the promise if one is waiting
        if (window._mcpToolResolve) {
          window._mcpToolResolve(result);
          delete window._mcpToolResolve;
        }
      } catch (error) {
        console.error("[MCP] Write file failed:", error);

        // Resolve with error
        if (window._mcpToolResolve) {
          window._mcpToolResolve({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          delete window._mcpToolResolve;
        }
      } finally {
        setWriteFileRequest(null);
      }
    },
    [writeFileRequest, callTool]
  );

  /**
   * Handle write file dialog denial
   */
  const handleWriteFileDeny = useCallback(() => {
    console.log("[MCP] User denied write file request");

    // Resolve with denial
    if (window._mcpToolResolve) {
      window._mcpToolResolve({
        success: false,
        error: "User denied permission",
      });
      delete window._mcpToolResolve;
    }

    setWriteFileRequest(null);
  }, []);

  return {
    // State
    permissionRequest,
    writeFileRequest,

    // Handlers
    handleToolCallRequest,
    handlePermissionApprove,
    handlePermissionDeny,
    handleWriteFileApprove,
    handleWriteFileDeny,
  };
}
