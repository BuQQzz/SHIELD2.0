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
import { isRemovalNote } from "@/services/historyCompaction";
import { isAgentsMd } from "@/config/agentsMd";
import { modelWrittenFiles } from "@/handlers/workLedger";
import { savePlanFromCall } from "@/handlers/sessionPlan";
import { changePreview, type ChangePreview } from "@/utils/changePreview";

/**
 * A command that asks the user carries the model's reason, shown in the
 * permission bar. Qwen3-Coder left it out and asked to run set-radio.ps1 -
 * a script that switches the Wi-Fi radio - with nothing but the command
 * (2026-09-28); bounced, the model sends the call again with one.
 */
const MISSING_REASON =
  'Not run: a command that needs the user\'s approval must include "reason" - one plain sentence telling the user what it will do, including what any script it runs does. Send the same command again with a reason.';

/**
 * Sent back when a write carries one of SHIELD's removal notes as content.
 * Qwen3-Coder copied "[7,253 characters, cleared to save space]" from its
 * trimmed history into write_file, replacing a working script.js - and
 * later PLAN.md - with that one line (2026-09-28).
 */
const REMOVAL_NOTE_WRITE =
  "Not run: the text you sent is SHIELD's note that something was removed from your context, not file content - writing it would replace the file with that note. Read the file to see what it contains now, then send the real content.";

/** True when a write or edit would put a removal note into a file */
function writesRemovalNote(
  tool: string,
  args: Record<string, unknown>
): boolean {
  if (tool === "write_file") {
    return typeof args.content === "string" && isRemovalNote(args.content);
  }
  if (tool === "edit_file" && Array.isArray(args.edits)) {
    return args.edits.some(
      (edit) =>
        typeof (edit as { newText?: unknown })?.newText === "string" &&
        isRemovalNote((edit as { newText: string }).newText)
    );
  }
  return false;
}

/** A write or edit of a project's AGENTS.md */
function writesAgentsMd(tool: string, args: Record<string, unknown>): boolean {
  return (
    (tool === "write_file" || tool === "edit_file") &&
    typeof args.path === "string" &&
    isAgentsMd(args.path)
  );
}

/** What a write or edit would put in the file, to read before approving */
function proposedText(
  tool: string,
  args: Record<string, unknown>
): string | undefined {
  if (tool === "write_file" && typeof args.content === "string") {
    return args.content;
  }
  if (tool === "edit_file" && Array.isArray(args.edits)) {
    return args.edits
      .map((edit) => (edit as { newText?: unknown })?.newText)
      .filter((text): text is string => typeof text === "string")
      .join("\n\n---\n\n");
  }
  return undefined;
}

/** Existing files larger than this are not rewritten without a second try */
const REWRITE_MIN_BYTES = 2500;
/** How long a sent-back rewrite of a file stays allowed */
const REWRITE_WARNING_MS = 10 * 60_000;

const rewriteMessage = (path: string, size: number) =>
  `Not run: ${path} already exists (${size.toLocaleString("en-US")} characters). Change it with edit_file, replacing only the lines that need to change: rewriting resends the whole file into your context and can drop code that works. If most of the file really has to change, tell the user why, then send the same write_file again.`;

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
  /** A write or edit of AGENTS.md: asked every time, never "for session" */
  instructionsFile?: boolean;
  /** The text a write or edit would put in the file, to read first */
  proposed?: string;
  /** The team member asking (coder, tester, reviewer), when one is */
  agent?: string;
  /** What an edit or a write would do to the file, to read before approving */
  change?: ChangePreview;
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

export function useMCPDialogs({
  callTool,
  policy: defaultPolicy,
}: UseMCPDialogsProps) {
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
  /** An approved call is running; further clicks do nothing */
  const approvalInFlight = useRef(false);
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

  /** When each file was last sent back as a rewrite (canonical path) */
  const rewriteWarned = useRef<Map<string, number>>(new Map());

  /**
   * The reason to send back a write_file that would replace a sizeable
   * existing file, or null. Rewriting resends the whole file into the
   * model's context and has dropped working code ("a clean, working
   * version" that became a "simpler version"); the fix is usually a few
   * lines of edit_file. Sent back once: the same write within the next
   * minutes goes through, for a file that really changes throughout.
   */
  const rewriteWarning = useCallback(
    async (tool: string, args: Record<string, unknown>) => {
      if (tool !== "write_file" || typeof args.path !== "string") return null;
      const key = canonicalPath(args.path, workspaceFolder);
      const warnedAt = rewriteWarned.current.get(key);
      if (warnedAt && Date.now() - warnedAt < REWRITE_WARNING_MS) return null;
      try {
        const info = await callTool({
          serverName: "filesystem",
          tool: "get_file_info",
          arguments: { path: args.path },
        });
        if (!info.success || (info.data as { isError?: unknown })?.isError) {
          return null; // A new file
        }
        const size = Number(
          resultPayload(info.data).match(/\bsize:\s*(\d+)/i)?.[1]
        );
        if (!(size > REWRITE_MIN_BYTES)) return null;
        rewriteWarned.current.set(key, Date.now());
        return rewriteMessage(args.path, size);
      } catch {
        return null;
      }
    },
    [callTool, workspaceFolder]
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
    async (
      request: ToolCallRequest,
      // A sub-agent's calls are decided by the worker policy, not the
      // orchestrator's; the same prompts and permission bar serve both
      options: { policy?: ToolPolicy; agent?: string } = {}
    ): Promise<MCPToolResult> => {
      const policy = options.policy ?? defaultPolicy;
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

      // A removal note is never file content
      if (writesRemovalNote(toolCall.tool, toolCall.arguments)) {
        return { success: false, error: REMOVAL_NOTE_WRITE };
      }

      const policyDecision = policy.decide({
        name: toolCall.tool,
        arguments: toolCall.arguments,
      });
      const writesInstructions = writesAgentsMd(
        toolCall.tool,
        toolCall.arguments
      );
      const decision =
        policyDecision === "ask" &&
        sessionApproved.current.has(toolCall.tool) &&
        !asksEveryTime(toolCall.tool) &&
        !writesInstructions
          ? "run"
          : // AGENTS.md is read into every future session: the user sees
            // and approves each change, even in Auto
            policyDecision === "run" && writesInstructions
            ? "ask"
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

      // A whole existing file rewritten is sent back once
      const rewrite = await rewriteWarning(toolCall.tool, toolCall.arguments);
      if (rewrite) return { success: false, error: rewrite };

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
          savePlanFromCall(toolCall.tool, toolCall.arguments, result);
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
          instructionsFile: writesInstructions || undefined,
          proposed: writesInstructions
            ? proposedText(toolCall.tool, toolCall.arguments)
            : undefined,
          agent: options.agent,
          change: changePreview(toolCall.tool, toolCall.arguments) ?? undefined,
        });
      });
    },
    [defaultPolicy, callTool, noteWrite, modelScriptsIn, rewriteWarning]
  );

  /**
   * User approved. `remember` promotes the tool so it stops asking.
   */
  const handleApprove = useCallback(
    async (remember: boolean) => {
      const request = pendingRequest;
      // One click, one run: a second click on Allow while the first is
      // running would call the tool twice (a write, a command)
      if (!request || !resolverRef.current || approvalInFlight.current) return;
      approvalInFlight.current = true;
      setPendingRequest(null);

      // "Allow for session": stop asking for this tool until SHIELD closes.
      // It used to widen the saved allowlist, which did nothing once every
      // tool was allowed by default. Never for deletes or commands - each
      // is confirmed.
      if (
        remember &&
        !asksEveryTime(request.toolName) &&
        !request.instructionsFile
      ) {
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
        approvalInFlight.current = false;
      }
    },
    [pendingRequest, callTool, settings.mcp, updateSettings, settle, noteWrite]
  );

  /**
   * User declined. Too late once the approved call is running.
   */
  const handleDeny = useCallback(() => {
    if (approvalInFlight.current) return;
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
