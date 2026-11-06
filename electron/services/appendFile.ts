/**
 * Append to a file
 *
 * The official filesystem MCP server cannot add to the end of a file: only
 * write_file (the whole file) or edit_file (an exact oldText to replace).
 * Asked to add a section to a 6,101-character file it could not see the end
 * of, Qwen3.8 27B (IQ1_M) sent write_file with only the new section, then
 * with "...existing..." standing in for the rest, and in earlier runs cut
 * the file to 1,350 characters (2026-11-05). Appending needs neither the
 * file's text nor its end.
 */

import type { MCPToolResult } from "./MCPServerConfig.js";

export const APPEND_TOOL_NAME = "append_file";

/** Listed alongside the filesystem server's own tools */
export const APPEND_TOOL = {
  name: APPEND_TOOL_NAME,
  description:
    "Add text to the end of an existing file, keeping everything already in it. Use this to add a section, entry or line at the end; you do not need to read the end of the file first. Use write_file to create a new file.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Full path of the existing file",
      },
      content: {
        type: "string",
        description: "The text to add at the end",
      },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
};

export interface AppendDeps {
  /** The file's current text, or null when there is no file at the path */
  read: (target: string) => Promise<string | null>;
  append: (target: string, text: string) => Promise<void>;
}

const text = (message: string) => ({
  content: [{ type: "text", text: message }],
});

/**
 * Add `content` to the end of `target`, starting it on a line of its own.
 * The caller has already resolved the path and checked it is inside the
 * allowed folders.
 */
export async function appendToFile(
  target: unknown,
  content: unknown,
  deps: AppendDeps
): Promise<MCPToolResult> {
  if (typeof target !== "string" || target.trim() === "") {
    return { success: false, error: "No path provided" };
  }
  if (typeof content !== "string" || content.trim() === "") {
    return { success: false, error: "No content provided: nothing to add" };
  }

  let current: string | null;
  try {
    current = await deps.read(target);
  } catch (error) {
    return {
      success: false,
      error: `Could not read ${target}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (current === null) {
    return {
      success: false,
      error: `No file at ${target}. To create it, use write_file.`,
    };
  }

  // Turned back from write_file, Qwen3.8 sent the whole file again here,
  // and the file held it twice (2026-11-05)
  const repeated = repeatedOpening(content, current);
  if (repeated) {
    return {
      success: false,
      error: `Not run: the text starts with what is already in ${target} (${repeated}), so the file would hold it twice. Nothing was changed. Send only the new text to add at the end.`,
    };
  }

  // A blank line before a new Markdown heading, one line break otherwise
  const gap =
    current === "" || current.endsWith("\n\n")
      ? ""
      : current.endsWith("\n")
        ? /^\s*#/.test(content)
          ? "\n"
          : ""
        : /^\s*#/.test(content)
          ? "\n\n"
          : "\n";
  const added = gap + content + (content.endsWith("\n") ? "" : "\n");
  try {
    await deps.append(target, added);
  } catch (error) {
    return {
      success: false,
      error: `Could not write to ${target}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const lines = current.split("\n").length - (current.endsWith("\n") ? 1 : 0);
  return {
    success: true,
    data: text(
      `Added ${content.length.toLocaleString("en-US")} characters to the end of ${target}, after its ${lines.toLocaleString("en-US")} existing lines, which are unchanged.`
    ),
  };
}

/** Shortest opening worth comparing: a short line ("- Water") repeats by chance */
const OPENING_CHARS = 120;

/**
 * Where the text's opening is already in the file, as "its first line"
 * or "lines from its middle", or null when it is new. Compared with
 * whitespace collapsed.
 */
function repeatedOpening(content: string, current: string): string | null {
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  const opening = flat(content).slice(0, OPENING_CHARS);
  if (opening.length < OPENING_CHARS) return null;
  const file = flat(current);
  const at = file.indexOf(opening);
  if (at < 0) return null;
  return at === 0 ? "its first lines" : "lines from its middle";
}
