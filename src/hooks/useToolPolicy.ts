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
  /** What to do with a given tool call */
  decide: (tool: ToolDefinition | { name: string }) => ToolDecision;
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
}

/** SHIELD's own web tools come from this server (electron/services/webTools) */
export const WEB_SERVER_NAME = "web";

/**
 * Pure policy resolution, exported for testing without React.
 */
export function resolveToolPolicy({
  mode,
  allowedTools,
  serverTools,
  webSearchEnabled = false,
}: ToolPolicyInput): ToolPolicy {
  // The allowlist applies in every mode - a mode can narrow what the user
  // permitted, never widen it.
  const allowlisted = serverTools.filter((tool) =>
    tool.serverName === WEB_SERVER_NAME
      ? webSearchEnabled
      : allowedTools.includes(tool.name)
  );
  const allowedNames = new Set(allowlisted.map((tool) => tool.name));

  // In readonly the model is never told mutating tools exist, so it does not
  // propose them and the user never sees a refusal for something it could
  // not have known was off limits. Plan mode still advertises them, because
  // a plan has to be able to say "then I would write this file".
  const advertisedTools =
    mode === "readonly"
      ? allowlisted.filter((tool) => !isMutatingTool(tool))
      : allowlisted;

  const decide = (call: ToolDefinition | { name: string }): ToolDecision => {
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
 * React binding for {@link resolveToolPolicy}.
 */
export function useToolPolicy(input: ToolPolicyInput): ToolPolicy {
  const { mode, allowedTools, serverTools, webSearchEnabled } = input;

  return useMemo(
    () =>
      resolveToolPolicy({ mode, allowedTools, serverTools, webSearchEnabled }),
    [mode, allowedTools, serverTools, webSearchEnabled]
  );
}
