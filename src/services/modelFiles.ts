/**
 * Finding library models on disk (main process only)
 *
 * The models folder can be SHIELD's own download folder or an existing
 * collection such as LM Studio's (`publisher/repo/file.gguf`), so files are
 * found by name anywhere below it rather than at a fixed path.
 */

import fs from "fs/promises";
import path from "path";
import {
  matchesModelFile,
  pickModelFile,
  type ModelFile,
  type ModelMetadata,
} from "../config/models.js";

/** Deep enough for publisher/repo/quant/file.gguf layouts */
const MAX_DEPTH = 4;

/**
 * Every .gguf file below `root`, as full paths. Skips hidden folders (e.g.
 * .hf-cache) and anything unreadable; a missing root gives an empty list.
 */
export async function findGgufFiles(
  root: string,
  maxDepth = MAX_DEPTH
): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !entry.name.startsWith(".")) {
          await walk(full, depth + 1);
        }
      } else if (entry.name.toLowerCase().endsWith(".gguf")) {
        found.push(full);
      }
    }
  }

  await walk(root, 0);
  return found;
}

export interface InstalledModelFile {
  file: ModelFile;
  path: string;
}

/** The files of `model` present among `paths`, in the model's file order */
export function findInstalledFiles(
  model: Pick<ModelMetadata, "files">,
  paths: string[]
): InstalledModelFile[] {
  const installed: InstalledModelFile[] = [];
  for (const file of model.files) {
    const match = paths.find((p) => matchesModelFile(path.basename(p), file));
    if (match) installed.push({ file, path: match });
  }
  return installed;
}

/**
 * The installed file to load on this GPU, using the same rule as downloads:
 * the best quantization the GPU meets, else the smallest one installed.
 */
export function chooseInstalledFile(
  model: Pick<ModelMetadata, "files">,
  paths: string[],
  vramGB: number | null
): InstalledModelFile | undefined {
  const installed = findInstalledFiles(model, paths);
  const chosen = pickModelFile(
    installed.map((entry) => entry.file),
    vramGB
  );
  return installed.find((entry) => entry.file === chosen);
}
