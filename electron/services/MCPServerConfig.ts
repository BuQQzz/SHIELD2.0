/**
 * MCP Server Configuration and Types
 *
 * Defines official MCP server configurations, allowed paths,
 * and type definitions for MCP operations.
 */

import fs from "fs";
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
 * A Windows drive or UNC path on a system that is not Windows. `path` reads
 * "C:\\Windows\\x" as a relative name there, so it would be resolved into the
 * workspace as a file called "C:\\Windows\\x". It names nothing on this
 * system, so it is left as written for the check to refuse.
 */
function isForeignAbsolute(value: string, platform = process.platform) {
  return platform !== "win32" && /^(?:[A-Za-z]:[\\/]|\\\\)/.test(value);
}

/** Filesystem tool arguments that hold a single path */
const PATH_ARGUMENTS = ["path", "source", "destination"] as const;

/**
 * Make every path argument absolute, relative to `baseDir`.
 *
 * Models say "." or "README.md" when they mean the user's current folder.
 * Resolved by Node, those land in the Electron process's own directory - the
 * SHIELD install - which was then denied, and the model apologised for a
 * path it had got right.
 *
 * Absolute paths are left as they are, except that where names ignore case
 * (Windows) a path inside `baseDir` spelled with other capitals takes
 * baseDir's own: SHIELD's check and the filesystem server compare exact
 * text, and refused "...\WiFi\diag.ps1" for a folder named "wifi" (Gemma,
 * 2026-09-26), though Windows sees one folder.
 */
export function resolveToolPaths(
  args: Record<string, unknown>,
  baseDir: string,
  ignoreCase = process.platform === "win32"
): Record<string, unknown> {
  const base = path.resolve(baseDir);
  const inBaseSpelling = (value: string) => {
    const full = path.resolve(value);
    if (!ignoreCase || full.startsWith(base)) return value;
    const lower = full.toLowerCase();
    const lowerBase = base.toLowerCase();
    return lower === lowerBase || lower.startsWith(lowerBase + path.sep)
      ? base + full.slice(base.length)
      : value;
  };
  const resolveOne = (value: unknown) =>
    typeof value !== "string" || value.trim() === "" || isForeignAbsolute(value)
      ? value
      : path.isAbsolute(value)
        ? inBaseSpelling(value)
        : path.resolve(baseDir, value);

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

  const allowedRoots = config.allowedPaths.flatMap((allowedPath) => {
    const lexical = path.resolve(allowedPath);
    const real = realPathOf(lexical);
    return real === lexical ? [lexical] : [lexical, real];
  });

  for (const target of targets) {
    if (typeof target !== "string" || target.trim() === "") {
      return { success: false, error: "No path provided" };
    }

    // Never resolve against the process's own directory: a relative path
    // there would be judged by where SHIELD happens to run (callers make
    // paths absolute against the workspace first - see resolveToolPaths).
    if (!path.isAbsolute(target)) {
      console.log("[MCPServerConfig] Denied non-absolute path:", target);
      return {
        success: false,
        error: `Access denied - not an absolute path on this system: ${target}`,
      };
    }

    // Both the path as written and where it really leads (symlinks) must be
    // inside an allowed directory; a link inside the folder cannot lead out
    const normalizedPath = path.resolve(path.normalize(target));
    const realPath = realPathOf(normalizedPath);
    const isAllowed = [normalizedPath, realPath].every((candidate) =>
      allowedRoots.some((root) => isInside(candidate, root))
    );

    if (!isAllowed) {
      console.log("[MCPServerConfig] Denied path:", {
        original: target,
        normalized: normalizedPath,
        resolved: realPath,
        allowedPaths: config.allowedPaths,
      });
      return {
        success: false,
        error: `Access denied - path outside allowed directories: ${realPath} not in [${config.allowedPaths.join(", ")}]`,
      };
    }
  }

  return { success: true };
}

function isInside(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/**
 * `target` with symlinks resolved. A path that does not exist yet (a file
 * about to be written) is resolved through its nearest existing parent.
 */
function realPathOf(target: string): string {
  const missing: string[] = [];
  let current = target;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      missing.push(path.basename(current));
      current = parent;
    }
  }
}
