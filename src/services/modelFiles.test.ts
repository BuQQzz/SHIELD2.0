// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  chooseInstalledFile,
  findGgufFiles,
  findInstalledFiles,
} from "./modelFiles";
import { getModelById } from "../config/models";

let root: string;

/** A models folder laid out like a real mixed collection */
const LAYOUT = [
  // LM Studio: publisher/repo/file
  "lmstudio-community/gemma-4-12B-it-GGUF/gemma-4-12B-it-Q4_K_M.gguf",
  "lmstudio-community/gemma-4-12B-it-GGUF/mmproj-gemma-4-12B-it-BF16.gguf",
  "lmstudio-community/Qwen3.8-27B-GGUF/Qwen3.8-27B-Q4_K_M.gguf",
  "unsloth/Qwen3.8-27B-UD-IQ3_XXS-GGUF/Qwen3.8-27B-UD-IQ3_XXS.gguf",
  // SHIELD / node-llama-cpp download at the top level
  "hf_unsloth_Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf",
  // Hidden caches and too-deep folders are skipped
  ".hf-cache/gemma-4-E4B-it-Q4_K_M.gguf",
  "a/b/c/d/e/gemma-4-E4B-it-Q4_K_M.gguf",
  "notes.txt",
];

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "shield-models-"));
  for (const rel of LAYOUT) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, "");
  }
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("findGgufFiles", () => {
  it("finds .gguf files at any depth up to the limit, skipping hidden folders", async () => {
    const found = (await findGgufFiles(root)).map((p) =>
      path.relative(root, p).split(path.sep).join("/")
    );
    expect(found.sort()).toEqual(
      LAYOUT.filter(
        (rel) =>
          rel.endsWith(".gguf") && !rel.startsWith(".") && !rel.startsWith("a/")
      ).sort()
    );
  });

  it("returns nothing for a missing folder", async () => {
    expect(await findGgufFiles(path.join(root, "missing"))).toEqual([]);
  });
});

describe("installed files", () => {
  it("finds library models in any layout", async () => {
    const paths = await findGgufFiles(root);
    const installed = (id: string) =>
      findInstalledFiles(getModelById(id)!, paths).map((entry) =>
        path.basename(entry.path)
      );

    expect(installed("gemma-4-12b")).toEqual(["gemma-4-12B-it-Q4_K_M.gguf"]);
    expect(installed("qwen3-coder-30b")).toEqual([
      "hf_unsloth_Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf",
    ]);
    expect(installed("qwen3.8-27b")).toEqual([
      "Qwen3.8-27B-Q4_K_M.gguf",
      "Qwen3.8-27B-UD-IQ3_XXS.gguf",
    ]);
    // Only in the hidden cache and a too-deep folder
    expect(installed("gemma-4-e4b")).toEqual([]);
  });

  it("loads the quantization that suits the GPU", async () => {
    const paths = await findGgufFiles(root);
    const qwen = getModelById("qwen3.8-27b")!;
    const name = (vram: number | null) =>
      path.basename(chooseInstalledFile(qwen, paths, vram)?.path ?? "");

    expect(name(12)).toBe("Qwen3.8-27B-UD-IQ3_XXS.gguf");
    expect(name(24)).toBe("Qwen3.8-27B-Q4_K_M.gguf");
    expect(name(null)).toBe("Qwen3.8-27B-Q4_K_M.gguf");
  });

  it("falls back to whatever quantization is installed", () => {
    const qwen = getModelById("qwen3.8-27b")!;
    const onlyQ4 = [path.join(root, "x", "Qwen3.8-27B-UD-Q4_K_M.gguf")];
    expect(
      path.basename(chooseInstalledFile(qwen, onlyQ4, 12)?.path ?? "")
    ).toBe("Qwen3.8-27B-UD-Q4_K_M.gguf");
    expect(chooseInstalledFile(qwen, [], 12)).toBeUndefined();
  });
});
