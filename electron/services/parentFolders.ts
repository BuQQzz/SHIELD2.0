/**
 * Parent folders for a new file
 *
 * The official filesystem server's write_file fails with ENOENT when the
 * file's folder does not exist yet. Four of six hosted flash models wrote
 * src/tokenize.js into an empty project first and got that error; MiniMax
 * M3.1 Flash lost four parallel writes to it (2026-11-22). Creating the
 * folders first is what the model meant.
 *
 * Call only after validateFilesystemPath passed: it judges the nearest
 * existing folder by its real path, so the folders made here stay inside
 * the allowed ones.
 */

import path from "path";

const CREATES_FILES = new Set(["write_file", "append_file"]);

export async function makeParentFolders(
  tool: string,
  target: unknown,
  mkdir: (dir: string, options: { recursive: true }) => Promise<unknown>
): Promise<void> {
  if (!CREATES_FILES.has(tool) || typeof target !== "string" || !target) {
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
}
