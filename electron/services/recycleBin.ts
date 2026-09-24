/**
 * Recycle Bin delete
 *
 * The official filesystem MCP server has no delete tool. Asked to delete a
 * file, models invented `delete_file`, or "deleted" it by renaming it to
 * trash_file.md. SHIELD provides the tool itself, and it never erases:
 * everything goes to the Recycle Bin, where the user can restore it - the
 * same thing Delete does in Explorer.
 */

import path from "path";
import type { MCPToolResult } from "./MCPServerConfig.js";

export const DELETE_TOOL_NAME = "delete_file";

/** Listed alongside the filesystem server's own tools */
export const DELETE_TOOL = {
  name: DELETE_TOOL_NAME,
  description:
    "Delete a file or folder by moving it to the Recycle Bin, where the user can restore it. Use this whenever the user asks to delete or remove something; never imitate deleting by renaming, moving or emptying a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Full path of the file or folder to delete",
      },
    },
    required: ["path"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};

export interface RecycleBinDeps {
  /** Resolves to true when something exists at the path */
  exists: (target: string) => Promise<boolean>;
  /** Moves the path to the Recycle Bin (Electron's shell.trashItem) */
  trash: (target: string) => Promise<void>;
}

const text = (message: string) => ({
  content: [{ type: "text", text: message }],
});

/**
 * Move `target` to the Recycle Bin. The caller has already resolved it and
 * checked it is inside the allowed folders; this refuses the allowed folders
 * themselves, so a model cannot bin the whole workspace.
 */
export async function moveToRecycleBin(
  target: unknown,
  allowedRoots: string[],
  deps: RecycleBinDeps
): Promise<MCPToolResult> {
  if (typeof target !== "string" || target.trim() === "") {
    return { success: false, error: "No path provided" };
  }

  const resolved = path.resolve(target);
  const isRoot = allowedRoots.some(
    (root) => path.resolve(root).toLowerCase() === resolved.toLowerCase()
  );
  if (isRoot) {
    return {
      success: false,
      error: `Refusing to delete ${resolved}: it is the folder SHIELD is allowed to use. Delete the files inside it instead.`,
    };
  }

  if (!(await deps.exists(resolved))) {
    return {
      success: false,
      error: `Nothing to delete: no file or folder at ${resolved}`,
    };
  }

  try {
    await deps.trash(resolved);
  } catch (error) {
    return {
      success: false,
      error: `Could not move ${resolved} to the Recycle Bin: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  return {
    success: true,
    data: text(
      `Moved ${resolved} to the Recycle Bin. The user can restore it from there.`
    ),
  };
}
