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

/**
 * Validate filesystem paths against allowed paths
 */
export function validateFilesystemPath(
  args: Record<string, unknown>,
  config: MCPServerConfig
): MCPToolResult {
  const targetPath = args.path as string;
  if (!targetPath) {
    return {
      success: false,
      error: "No path provided",
    };
  }

  // Normalize and resolve to absolute path
  const normalizedPath = path.resolve(path.normalize(targetPath));

  console.log("[MCPServerConfig] Validating path:", {
    original: targetPath,
    normalized: normalizedPath,
    allowedPaths: config.allowedPaths,
  });

  // Check if path is within allowed directories
  const isAllowed = config.allowedPaths.some((allowedPath) => {
    const normalized = path.resolve(path.normalize(allowedPath));
    const isInside =
      normalizedPath.startsWith(normalized + path.sep) ||
      normalizedPath === normalized;

    console.log("[MCPServerConfig] Checking:", {
      allowedPath,
      normalized,
      targetPath: normalizedPath,
      isInside,
    });

    return isInside;
  });

  if (!isAllowed) {
    const allowedPathsList = config.allowedPaths.join(", ");
    return {
      success: false,
      error: `Access denied - path outside allowed directories: ${normalizedPath} not in [${allowedPathsList}]`,
    };
  }

  return { success: true };
}
