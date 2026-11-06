/**
 * Local model files and this machine's hardware (main process only)
 *
 * Models run on llama-server; node-llama-cpp is kept for what it reads
 * without running a model: GPU memory, and GGUF files for context plans.
 */

import { getLlama, type Llama } from "node-llama-cpp";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  getModelById,
  isRuntimeAvailable,
  type HardwareInfo,
} from "../config/models.js";
import {
  chooseInstalledFile,
  findGgufFiles,
  type InstalledModelFile,
} from "./modelFiles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultModelsDir = path.join(__dirname, "..", "..", "models");

let modelsDir: string | undefined;
let bindings: Promise<Llama> | null = null;

/** The folder library models are found in (Settings › models folder) */
export function setModelsDir(dir: string | undefined): void {
  modelsDir = dir;
}

/** The llama.cpp bindings, loaded once: for VRAM and reading GGUF insights */
export function getLlamaBindings(): Promise<Llama> {
  bindings ??= getLlama();
  bindings.catch(() => (bindings = null));
  return bindings;
}

/**
 * GPU memory and system RAM in GB, for picking quantizations and
 * recommending models. VRAM is null when no GPU backend is available.
 */
export async function getHardwareInfo(): Promise<HardwareInfo> {
  const ramGB = nominalGB(os.totalmem());
  const llama = await getLlamaBindings();
  if (llama.gpu === false) return { vramGB: null, ramGB };
  const { total } = await llama.getVramState();
  return { vramGB: nominalGB(total), ramGB };
}

/**
 * Memory as sold. The driver and firmware keep some back, so an 8 GB RTX
 * 2070 SUPER reports 7.6 GiB and 16 GB of RAM 15.5, which failed every
 * `minVRAM: 8` and `minRAM: 16` check.
 */
export function nominalGB(totalBytes: number): number {
  return Math.round(totalBytes / 2 ** 30);
}

/**
 * Find the file to load for a library model. Loading never downloads -
 * that is an explicit choice in the model library.
 */
export async function resolveModelPath(modelId: string): Promise<string> {
  return (await resolveModelFile(modelId)).path;
}

/** The installed file to load for a library model, with its catalog entry */
export async function resolveModelFile(
  modelId: string
): Promise<InstalledModelFile> {
  const model = getModelById(modelId);
  if (!model) {
    throw new Error(`Unknown model "${modelId}". Pick one from the library.`);
  }
  if (!isRuntimeAvailable(model)) {
    throw new Error(
      `${model.displayName} needs a runtime SHIELD does not support yet.`
    );
  }

  const dir = modelsDir || defaultModelsDir;
  const { vramGB } = await getHardwareInfo();
  const chosen = chooseInstalledFile(model, await findGgufFiles(dir), vramGB);
  if (!chosen) {
    throw new Error(
      `${model.displayName} is not installed in ${dir}. Download it from the Model Library.`
    );
  }
  console.log(`[LocalModels] Loading ${model.id} from ${chosen.path}`);
  return chosen;
}
