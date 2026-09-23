/**
 * MCP Server Configuration and Types
 *
 * Defines official MCP server configurations, allowed paths,
 * and type definitions for MCP operations.
 */

import path from "path";
import os from "os";

/**
 * MCP Server Configuration
 */
export interface MCPServerConfig {
  package: string;
  version: string;
  permissions: string[];
  allowedPaths: string[];
  requiresApproval: boolean;
}

/**
 * MCP Tool Call Request
 */
export interface MCPToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  serverName: string;
}

/**
 * MCP Tool Call Result
 */
export interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Official MCP Servers Whitelist
 * Only servers from @modelcontextprotocol are allowed
 */
export const OFFICIAL_MCP_SERVERS: Record<string, MCPServerConfig> = {
  filesystem: {
    package: "@modelcontextprotocol/server-filesystem",
    version: "^2025.8.21",
    permissions: ["read", "write", "list"],
    allowedPaths: [
      path.join(os.homedir(), "Documents"),
      path.join(os.homedir(), "Desktop"),
    ],
    requiresApproval: true,
  },
};

/** Filesystem tool arguments that hold a single path */
const PATH_ARGUMENTS = ["path", "source", "destination"] as const;

/**
 * Make every path argument absolute, relative to `baseDir`.
 *
 * Models say "." or "README.md" when they mean the user's current folder.
 * Resolved by Node, those land in the Electron process's own directory - the
 * SHIELD install - which was then denied, and the model apologised for a
 * path it had got right. Absolute paths are left untouched.
 */
export function resolveToolPaths(
  args: Record<string, unknown>,
  baseDir: string
): Record<string, unknown> {
  const resolveOne = (value: unknown) =>
    typeof value === "string" && value.trim() !== "" && !path.isAbsolute(value)
      ? path.resolve(baseDir, value)
      : value;

  const resolved: Record<string, unknown> = { ...args };
  for (const key of PATH_ARGUMENTS) {
    if (key in resolved) resolved[key] = resolveOne(resolved[key]);
  }
  if (Array.isArray(resolved.paths)) {
    resolved.paths = resolved.paths.map(resolveOne);
  }
  return resolved;
}

/**
 * Check every path a filesystem tool call would touch against the allowed
 * directories. Calls with no path argument (list_allowed_directories) pass.
 *
 * Only `path` used to be checked, and a call without one was rejected - so
 * move_file (source/destination), read_multiple_files (paths[]) and
 * list_allowed_directories could never run, and move_file's destination
 * was never checked by SHIELD at all.
 */
export function validateFilesystemPath(
  args: Record<string, unknown>,
  config: MCPServerConfig
): MCPToolResult {
  const targets: unknown[] = [
    ...PATH_ARGUMENTS.filter((key) => key in args).map((key) => args[key]),
    ...(Array.isArray(args.paths) ? args.paths : []),
  ];

  for (const target of targets) {
    if (typeof target !== "string" || target.trim() === "") {
      return { success: false, error: "No path provided" };
    }

    const normalizedPath = path.resolve(path.normalize(target));
    const isAllowed = config.allowedPaths.some((allowedPath) => {
      const normalized = path.resolve(path.normalize(allowedPath));
      return (
        normalizedPath.startsWith(normalized + path.sep) ||
        normalizedPath === normalized
      );
    });

    if (!isAllowed) {
      console.log("[MCPServerConfig] Denied path:", {
        original: target,
        normalized: normalizedPath,
        allowedPaths: config.allowedPaths,
      });
      return {
        success: false,
        error: `Access denied - path outside allowed directories: ${normalizedPath} not in [${config.allowedPaths.join(", ")}]`,
      };
    }
  }

  return { success: true };
}
