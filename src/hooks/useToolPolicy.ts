/**
 * Tool Policy
 *
 * Turns a permission mode plus the user's tool allowlist into the decisions
 * the rest of the app needs:
 *
 *   advertisedTools  what the model is told exists
 *   decide(tool)     run it, ask first, or record it without running
 *
 * Everything that varies by mode lives here. Callers ask the policy rather
 * than checking the mode themselves, so adding a mode does not mean hunting
 * for every `mode === "..."` in the codebase.
 */

import { useMemo } from "react";
import { isDeletionTool, isMutatingTool } from "@/config/toolClassification";
import {
  isReadOnlyCommand,
  RUN_COMMAND_TOOL_NAME,
  TERMINAL_SERVER_NAME,
} from "@/config/commandSafety";
import { PLAN_SERVER_NAME, UPDATE_PLAN_TOOL_NAME } from "@/config/plan";
import { FILESYSTEM_TOOLS } from "@/types/settings";
import type { PermissionMode } from "@/types/settings";
import type { ToolDefinition } from "@/types/prompts";

/**
 * What should happen when the model calls a tool.
 *
 * - run     execute immediately, no interruption
 * - ask     stop and wait for the user
 * - block   do not execute; record it as an intended step
 */
export type ToolDecision = "run" | "ask" | "block";

export interface ToolPolicy {
  /** Tools described to the model in the system prompt */
  advertisedTools: ToolDefinition[];
  /**
   * The user permits this tool at all: on the allowlist, or a web tool
   * with web search on. A mode may still ask or block it (see decide).
   */
  allows: (toolName: string) => boolean;
  /** What to do with a given tool call (run_command needs its arguments) */
  decide: (
    tool: ToolDefinition | { name: string; arguments?: Record<string, unknown> }
  ) => ToolDecision;
  /** True in plan mode, where changes are described rather than made */
  isPlanning: boolean;
  /** The mode this policy was derived from */
  mode: PermissionMode;
}

export interface ToolPolicyInput {
  mode: PermissionMode;
  /** Tools the user has enabled in Settings */
  allowedTools: string[];
  /** Tools the connected servers actually expose */
  serverTools: ToolDefinition[];
  /**
   * Settings > Web Search. The "web" server's tools (web_search,
   * fetch_page) are offered only when it is on; the allowlist covers the
   * filesystem tools.
   */
  webSearchEnabled?: boolean;
  /**
   * The file tools and the terminal belong to Code sessions. In a chat only
   * the web tools are offered, and a file tool the model calls anyway is
   * not permitted.
   */
  fileTools?: boolean;
}

/** SHIELD's own web tools come from this server (electron/services/webTools) */
export const WEB_SERVER_NAME = "web";
/**
 * SHIELD's memory of past conversations (electron/services/memory): offered
 * in chats and code sessions alike, and read-only, so it runs in every mode
 */
export const MEMORY_SERVER_NAME = "memory";

/**
 * Pure policy resolution, exported for testing without React.
 */
export function resolveToolPolicy({
  mode,
  allowedTools,
  serverTools,
  webSearchEnabled = false,
  fileTools = true,
}: ToolPolicyInput): ToolPolicy {
  // The allowlist applies in every mode - a mode can narrow what the user
  // permitted, never widen it.
  const allowlisted = serverTools.filter((tool) =>
    tool.serverName === WEB_SERVER_NAME
      ? webSearchEnabled
      : tool.serverName === MEMORY_SERVER_NAME
        ? true
        : tool.serverName === TERMINAL_SERVER_NAME ||
            tool.serverName === PLAN_SERVER_NAME
          ? fileTools
          : fileTools && allowedTools.includes(tool.name)
  );
  const allowedNames = new Set(allowlisted.map((tool) => tool.name));

  // In readonly the model is never told mutating tools exist, so it does not
  // propose them and the user never sees a refusal for something it could
  // not have known was off limits. Plan mode still advertises them, because
  // a plan has to be able to say "then I would write this file". The
  // terminal stays: read-only commands still run there.
  const advertisedTools =
    mode === "readonly"
      ? allowlisted.filter(
          (tool) => !isMutatingTool(tool) || tool.name === RUN_COMMAND_TOOL_NAME
        )
      : allowlisted;

  const decide: ToolPolicy["decide"] = (call) => {
    // The session's checklist changes nothing on the computer: it runs in
    // every mode, Ask included, and a plan is what Plan mode is for
    if (call.name === UPDATE_PLAN_TOOL_NAME) return "run";
    if (call.name === RUN_COMMAND_TOOL_NAME) {
      const command =
        "arguments" in call && typeof call.arguments?.command === "string"
          ? call.arguments.command
          : "";
      return decideCommand(mode, command);
    }
    // A call carries only a name; the server's definition has its
    // read-only hint (web_search and fetch_page declare one)
    const tool = serverTools.find((known) => known.name === call.name) ?? call;
    const mutating = isMutatingTool(tool);

    switch (mode) {
      case "ask":
        return "ask";

      // Everything the user knows SHIELD can do runs unattended - reads,
      // writes, edits, moves - except removing files, which always asks.
      // A tool SHIELD does not recognise also asks: it could do anything.
      case "auto": {
        if (isDeletionTool(tool)) return "ask";
        if (!mutating) return "run";
        const known =
          FILESYSTEM_TOOLS.includes(tool.name) || "annotations" in tool;
        return known ? "run" : "ask";
      }

      // Reads run so the plan is grounded in what is actually on disk - a
      // planner that cannot look at the file can only guess. Changes are
      // recorded as intended steps instead of being made.
      case "plan":
        return mutating ? "block" : "run";

      // Mutating tools are not advertised, but block them if one is called
      case "readonly":
        return mutating ? "block" : "run";
    }
  };

  return {
    advertisedTools,
    allows: (toolName) => allowedNames.has(toolName),
    decide,
    isPlanning: mode === "plan",
    mode,
  };
}

/**
 * run_command: a command that can only read runs like any read; anything
 * else asks in Auto (every time - see useMCPDialogs), is recorded in Plan
 * and refused in Read-only.
 */
function decideCommand(mode: PermissionMode, command: string): ToolDecision {
  if (mode === "ask") return "ask";
  if (isReadOnlyCommand(command)) return "run";
  return mode === "auto" ? "ask" : "block";
}

/**
 * React binding for {@link resolveToolPolicy}.
 */
export function useToolPolicy(input: ToolPolicyInput): ToolPolicy {
  const { mode, allowedTools, serverTools, webSearchEnabled, fileTools } =
    input;

  return useMemo(
    () =>
      resolveToolPolicy({
        mode,
        allowedTools,
        serverTools,
        webSearchEnabled,
        fileTools,
      }),
    [mode, allowedTools, serverTools, webSearchEnabled, fileTools]
  );
}
