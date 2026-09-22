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
 * This list exists because MCP tool annotations are not usable yet: the spec
 * defines `annotations.readOnlyHint`, but the official filesystem server
 * returns no annotations at all (checked against @modelcontextprotocol/
 * server-filesystem, Sept 2026). When a server does supply the hint we use it
 * and ignore this list.
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
