/**
 * Model Loader - Handles model resolution and loading
 * Manages model path resolution and GPU layer configuration
 */

import { Llama, LlamaModel, resolveModelFile } from "node-llama-cpp";
import path from "path";

export interface ModelConfig {
  name: string;
  uri: string;
  contextSize?: number;
}

export interface ModelLoadOptions {
  config: ModelConfig;
  modelsDir: string;
}

export interface ModelLoadResult {
  model: LlamaModel;
  modelPath: string;
}

/**
 * Resolves model path from URI (local file or Hugging Face)
 */
export async function resolveModelPath(
  config: ModelConfig,
  modelsDir: string
): Promise<string> {
  // Check if it's a custom local file (file:// URI) or Hugging Face URI
  if (config.uri.startsWith("file://")) {
    // Custom model: extract filename and build path
    const filename = config.uri.replace("file://", "");
    return path.join(modelsDir, filename);
  }

  // Standard Hugging Face model
  return await resolveModelFile(config.uri, modelsDir);
}

/**
 * Loads a model with automatic GPU layer offloading
 * "auto" tells llama.cpp to fit as many layers as possible in VRAM,
 * and automatically offload remaining layers to system RAM
 */
export async function loadModelWithGPU(
  llama: Llama,
  modelPath: string
): Promise<LlamaModel> {
  return await llama.loadModel({
    modelPath,
    gpuLayers: "auto", // Automatically split between VRAM and RAM
  });
}

/**
 * Complete model loading process
 */
export async function loadModel(
  llama: Llama,
  options: ModelLoadOptions
): Promise<ModelLoadResult> {
  const modelPath = await resolveModelPath(options.config, options.modelsDir);
  const model = await loadModelWithGPU(llama, modelPath);

  return { model, modelPath };
}
