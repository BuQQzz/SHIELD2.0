import {
  Llama,
  LlamaModel,
  resolveModelFile,
} from "node-llama-cpp";
import path from "path";

export interface ModelConfig {
  name: string;
  uri: string;
  contextSize?: number;
}

export interface ModelLoadResult {
  model: LlamaModel;
  warning?: string;
}

/**
 * Handles model loading from Hugging Face or local files
 * Manages GPU layer configuration and model validation
 */
export class ModelLoader {
  /**
   * Load a model from Hugging Face URI or local file
   */
  async loadModel(
    llama: Llama,
    config: ModelConfig,
    modelsDir: string
  ): Promise<ModelLoadResult> {
    const modelPath = await this.resolveModelPath(config.uri, modelsDir);

    // Load model with automatic GPU layer offloading
    // "auto" tells llama.cpp to fit as many layers as possible in VRAM,
    // and automatically offload remaining layers to system RAM
    // This enables running large models (e.g., 32B) on GPUs with limited VRAM
    const model = await llama.loadModel({
      modelPath,
      gpuLayers: "auto", // Automatically split between VRAM and RAM
    });

    return { model };
  }

  /**
   * Resolve model path from URI (Hugging Face or local file)
   */
  private async resolveModelPath(uri: string, modelsDir: string): Promise<string> {
    // Check if it's a custom local file (file:// URI) or Hugging Face URI
    if (uri.startsWith("file://")) {
      // Custom model: extract filename and build path
      const filename = uri.replace("file://", "");
      return path.join(modelsDir, filename);
    } else {
      // Standard Hugging Face model
      return await resolveModelFile(uri, modelsDir);
    }
  }
}
