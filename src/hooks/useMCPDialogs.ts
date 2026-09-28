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

import {
  isDeletionTool,
  unavailableToolMessage,
} from "@/config/toolClassification";
import { FILESYSTEM_TOOLS } from "@/types/settings";

/** SHIELD's web tools; known, so a call with web search off says "turned off" */
const WEB_TOOL_NAMES = ["web_search", "fetch_page"];
import { useState, useCallback, useRef } from "react";
import { resultPayload, type ToolCallRequest } from "@/handlers/mcpToolHandler";
import { callTarget, canonicalPath } from "@/handlers/mcpMessageHandler";
import type { MCPToolResult } from "@/types/electron";
import { useSettingsStore } from "@/store/settingsStore";
import { isMutatingTool } from "@/config/toolClassification";
import {
  RUN_COMMAND_TOOL_NAME,
  scriptsInCommand,
} from "@/config/commandSafety";
import type { ToolPolicy } from "@/hooks/useToolPolicy";
import { useConversationStore } from "@/stores/conversation-store";
import { modelWrittenFiles } from "@/handlers/workLedger";

/**
 * A command that asks the user carries the model's reason, shown in the
 * permission bar. Qwen3-Coder left it out and asked to run set-radio.ps1 -
 * a script that switches the Wi-Fi radio - with nothing but the command
 * (2026-09-28); bounced, the model sends the call again with one.
 */
const MISSING_REASON =
  'Not run: a command that needs the user\'s approval must include "reason" - one plain sentence telling the user what it will do, including what any script it runs does. Send the same command again with a reason.';

/** Longest script shown in the permission bar */
const SCRIPT_PREVIEW_CHARS = 20_000;

/** The file a successful call wrote, if it wrote one */
function writtenPath(
  tool: string,
  args: Record<string, unknown>,
  result: MCPToolResult
): string | undefined {
  if (!result.success || (result.data as { isError?: unknown })?.isError) {
    return undefined;
  }
  const key =
    tool === "write_file" || tool === "edit_file"
      ? "path"
      : tool === "move_file"
        ? "destination"
        : undefined;
  const value = key ? args[key] : undefined;
  return typeof value === "string" ? value : undefined;
}

/**
 * Deletes and terminal commands are confirmed one by one, never "for the
 * session": approving one command must not approve the next, which could
 * be anything.
 */
function asksEveryTime(tool: string): boolean {
  return isDeletionTool({ name: tool }) || tool === RUN_COMMAND_TOOL_NAME;
}

/** Why a call was not run in Plan or Read-only mode */
function blockedMessage(tool: string, isPlanning: boolean): string {
  if (tool === RUN_COMMAND_TOOL_NAME) {
    return isPlanning
      ? "Plan mode: this command was NOT run and has been recorded as a step in your plan. Commands that only read (git status, git diff, listing, reading and searching files) still run. Continue planning."
      : "Read-only mode: only commands that only read (git status, git diff, listing, reading and searching files) run, so this command was NOT run.";
  }
  return isPlanning
    ? `Plan mode: '${tool}' was NOT executed and has been recorded as a step in your plan. Continue planning - you may still read files.`
    : `Read-only mode: '${tool}' changes files, so it was NOT executed.`;
}

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
  /** Deletes (to the Recycle Bin): shown in red, never "Allow always" */
  isDestructive?: boolean;
  /** For move_file: where the file ends up */
  destinationPath?: string;
  /** For the web tools: the search query or page address that leaves the PC */
  webTarget?: string;
  /** For run_command: the exact command, shown in full; never "Allow for session" */
  command?: string;
  /** For run_command: the model's one-sentence account of what it does */
  commandReason?: string;
  /** Scripts the command runs that the model wrote or edited itself */
  modelScripts?: { path: string; content?: string }[];
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
    /** The file, folder, query or page it acts on */
    target?: string;
  } | null>(null);
  const resolverRef = useRef<((result: MCPToolResult) => void) | null>(null);
  /**
   * Tools the user chose "Allow for session" on. Kept in memory only, so
   * closing SHIELD resets it; deletes are never added.
   */
  const sessionApproved = useRef<Set<string>>(new Set());
  /** Files the model wrote, edited or moved since SHIELD started (canonical paths) */
  const modelWritten = useRef<Set<string>>(new Set());
  const { settings, updateSettings } = useSettingsStore();
  const workspaceFolder = settings.mcp.workspaceFolder;

  const noteWrite = useCallback(
    (tool: string, args: Record<string, unknown>, result: MCPToolResult) => {
      const path = writtenPath(tool, args, result);
      if (path) modelWritten.current.add(canonicalPath(path, workspaceFolder));
    },
    [workspaceFolder]
  );

  /**
   * The scripts a command runs that the model wrote, with their contents:
   * written since SHIELD started, or earlier in the open conversation
   */
  const modelScriptsIn = useCallback(
    async (command: string) => {
      const written = new Set(modelWritten.current);
      const messages =
        useConversationStore.getState().currentConversation?.messages ?? [];
      for (const path of modelWrittenFiles(messages)) {
        written.add(canonicalPath(path, workspaceFolder));
      }
      const scripts = scriptsInCommand(command).filter((script) =>
        written.has(canonicalPath(script, workspaceFolder))
      );
      return Promise.all(
        scripts.map(async (path) => {
          try {
            const read = await callTool({
              serverName: "filesystem",
              tool: "read_text_file",
              arguments: { path },
            });
            return {
              path,
              content: read.success
                ? resultPayload(read.data).slice(0, SCRIPT_PREVIEW_CHARS)
                : undefined,
            };
          } catch {
            return { path };
          }
        })
      );
    },
    [callTool, workspaceFolder]
  );

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
    async (request: ToolCallRequest): Promise<MCPToolResult> => {
      if (!policy.allows(request.tool)) {
        return {
          success: false,
          error: unavailableToolMessage(
            request.tool,
            [...FILESYSTEM_TOOLS, ...WEB_TOOL_NAMES],
            policy.advertisedTools.map((tool) => tool.name)
          ),
        };
      }

      // Models write bare tool names, which the parser files under
      // "filesystem"; send the call to the server that has the tool
      const toolCall = {
        ...request,
        serverName:
          policy.advertisedTools.find((tool) => tool.name === request.tool)
            ?.serverName ?? request.serverName,
      };

      const policyDecision = policy.decide({
        name: toolCall.tool,
        arguments: toolCall.arguments,
      });
      const decision =
        policyDecision === "ask" &&
        sessionApproved.current.has(toolCall.tool) &&
        !asksEveryTime(toolCall.tool)
          ? "run"
          : policyDecision;

      // Recorded as an intended step rather than performed. In plan mode this
      // is only ever a mutating tool - reads still run, so the plan can be
      // based on what is actually in the files.
      if (decision === "block") {
        return {
          success: false,
          blocked: true,
          error: blockedMessage(toolCall.tool, policy.isPlanning),
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
          target: callTarget(toolCall),
        });
        try {
          const result = await callTool({
            serverName: toolCall.serverName,
            tool: toolCall.tool,
            arguments: toolCall.arguments,
          });
          noteWrite(toolCall.tool, toolCall.arguments, result);
          return result;
        } finally {
          setRunningTool(null);
        }
      }

      const command =
        toolCall.tool === RUN_COMMAND_TOOL_NAME
          ? String(toolCall.arguments.command ?? "")
          : undefined;
      const reason =
        typeof toolCall.arguments.reason === "string"
          ? toolCall.arguments.reason.trim()
          : "";
      if (command !== undefined && !reason) {
        return { success: false, error: MISSING_REASON };
      }
      const modelScripts =
        command !== undefined ? await modelScriptsIn(command) : undefined;

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
              : typeof toolCall.arguments.source === "string"
                ? toolCall.arguments.source
                : undefined,
          destinationPath:
            typeof toolCall.arguments.destination === "string"
              ? toolCall.arguments.destination
              : undefined,
          isDestructive: isDeletionTool({ name: toolCall.tool }),
          webTarget:
            typeof toolCall.arguments.query === "string"
              ? toolCall.arguments.query
              : typeof toolCall.arguments.url === "string"
                ? toolCall.arguments.url
                : undefined,
          command,
          commandReason: command !== undefined ? reason : undefined,
          modelScripts: modelScripts?.length ? modelScripts : undefined,
        });
      });
    },
    [policy, callTool, noteWrite, modelScriptsIn]
  );

  /**
   * User approved. `remember` promotes the tool so it stops asking.
   */
  const handleApprove = useCallback(
    async (remember: boolean) => {
      const request = pendingRequest;
      if (!request) return;

      // "Allow for session": stop asking for this tool until SHIELD closes.
      // It used to widen the saved allowlist, which did nothing once every
      // tool was allowed by default. Never for deletes or commands - each
      // is confirmed.
      if (remember && !asksEveryTime(request.toolName)) {
        sessionApproved.current.add(request.toolName);
      }

      setRunningTool({
        tool: request.toolName,
        serverName: request.serverName,
        target: request.targetPath ?? request.webTarget ?? request.command,
      });

      try {
        const result = await callTool({
          serverName: request.serverName,
          tool: request.toolName,
          arguments: request.arguments,
        });
        console.log("[MCP] Tool result:", result);
        noteWrite(request.toolName, request.arguments, result);
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
    [pendingRequest, callTool, settings.mcp, updateSettings, settle, noteWrite]
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
