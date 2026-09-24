/**
 * Tool Classification
 *
 * Decides whether an MCP tool only reads, or whether it can change something
 * on disk. Permission modes use this to know what can run without asking.
 */

import type { ToolDefinition } from "../types/prompts";

/**
 * Tools known to only read.
 *
 * When a server supplies `annotations.readOnlyHint` we use it and ignore this
 * list. The official filesystem server does since 2026.8.x, and its hints
 * match this list exactly (checked 2026-09-22 against 2026.8.31). The list
 * remains the fallback for servers, or older versions, without annotations.
 *
 * DO NOT add an "unknown tools are probably reads" fallback. Anything absent
 * from this list is treated as mutating and will prompt the user. That is the
 * point: a server added next year must not get silent write access because
 * nobody remembered to update a list written in 2026. Over-prompting is a
 * papercut; silently writing to someone's disk is not.
 */
const KNOWN_READ_ONLY_TOOLS = new Set([
  // @modelcontextprotocol/server-filesystem
  "read_file",
  "read_text_file",
  "read_media_file",
  "read_multiple_files",
  "list_directory",
  "list_directory_with_sizes",
  "directory_tree",
  "search_files",
  "get_file_info",
  "list_allowed_directories",
]);

/** A tool as the server described it, including optional MCP annotations */
export interface ClassifiableTool {
  name: string;
  annotations?: {
    readOnlyHint?: boolean;
  };
}

/**
 * True when calling this tool could change something.
 *
 * Resolution order:
 *   1. The server's own `readOnlyHint`, when it provides one.
 *   2. The known read-only list above.
 *   3. Mutating - the safe assumption for anything unrecognised.
 */
export function isMutatingTool(
  tool: ClassifiableTool | ToolDefinition
): boolean {
  const annotations = (tool as ClassifiableTool).annotations;

  // The server knows better than we do
  if (typeof annotations?.readOnlyHint === "boolean") {
    return !annotations.readOnlyHint;
  }

  return !KNOWN_READ_ONLY_TOOLS.has(tool.name);
}

/** Convenience inverse of {@link isMutatingTool} */
export function isReadOnlyTool(
  tool: ClassifiableTool | ToolDefinition
): boolean {
  return !isMutatingTool(tool);
}

/**
 * What to tell the model when it calls a tool that is not on the allowlist.
 *
 * Qwen3-Coder, asked to delete a file, called `delete_file` - which no
 * server has - and was told it was "disabled in MCP tool settings", as if
 * the user could switch it on. A tool that does not exist gets a different
 * answer: what does exist, and to tell the user when none of it fits.
 */
export function unavailableToolMessage(
  toolName: string,
  knownTools: readonly string[],
  offeredTools: readonly string[]
): string {
  if (knownTools.includes(toolName)) {
    return `Tool '${toolName}' is disabled in MCP tool settings, so it did not run. Tell the user; they can enable it in Settings.`;
  }
  const offered = offeredTools.length > 0 ? offeredTools.join(", ") : "none";
  return `There is no tool called '${toolName}'. The only tools that exist are: ${offered}. Do not invent tools. If none of these can do what the user asked, tell the user plainly that it is not possible with the available tools.`;
}
