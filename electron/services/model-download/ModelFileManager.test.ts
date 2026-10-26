// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ModelFileManager } from "./ModelFileManager";
import { getModelById } from "../../../src/config/models";

let root: string;
let trashed: string[];
let manager: ModelFileManager;

async function touch(rel: string, bytes = 0) {
  const full = path.join(root, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, Buffer.alloc(bytes));
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "shield-fm-"));
  trashed = [];
  manager = new ModelFileManager(() => root, {
    trash: async (target) => {
      trashed.push(path.relative(root, target).split(path.sep).join("/"));
    },
  });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("ModelFileManager", () => {
  it("lists installed library models found anywhere in the folder", async () => {
    await touch("lmstudio-community/gemma/gemma-4-12B-it-Q4_K_M.gguf");
    await touch("hf_unsloth_Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf");
    await touch("other/SomeOtherModel-Q4_K_M.gguf");

    expect((await manager.listInstalledModels()).sort()).toEqual([
      "gemma-4-12b",
      "qwen3-coder-30b",
    ]);
    expect(await manager.isModelInstalled(getModelById("gemma-4-e4b")!)).toBe(
      false
    );
  });

  it("moves every installed quantization to the Recycle Bin, nothing else", async () => {
    await touch("a/Qwen3.8-27B-Q4_K_M.gguf");
    await touch("b/Qwen3.8-27B-UD-IQ3_XXS.gguf");
    await touch("c/gemma-4-12b-it-Q4_K_M.gguf");

    expect(await manager.deleteModel(getModelById("qwen3.8-27b")!)).toBe(true);
    expect(trashed.sort()).toEqual([
      "a/Qwen3.8-27B-Q4_K_M.gguf",
      "b/Qwen3.8-27B-UD-IQ3_XXS.gguf",
    ]);
  });

  it("reports false when there is nothing to delete", async () => {
    expect(await manager.deleteModel(getModelById("gemma-4-e4b")!)).toBe(false);
    expect(trashed).toEqual([]);
  });

  it("counts disk space for library files only", async () => {
    await touch("gemma-4-12b-it-Q4_K_M.gguf", 100);
    await touch("unrelated-Q4_K_M.gguf", 1000);
    expect(await manager.getTotalDiskSpace()).toBe(100);
  });
});
