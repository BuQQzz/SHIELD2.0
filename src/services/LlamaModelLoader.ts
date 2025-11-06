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
 * Handles model loading operations with llama.cpp
 * Manages model path resolution, GPU configuration, and error handling
 */
export class LlamaModelLoader {
  constructor(
    private llama: Llama,
    private modelsDir: string
  ) {}

  /**
   * Load a model from Hugging Face URI or local file
   * Automatically configures GPU layers for optimal VRAM usage
   */
  async loadModel(config: ModelConfig): Promise<ModelLoadResult> {
    const modelPath = await this.resolveModelPath(config.uri);

    // Load model with automatic GPU layer offloading
    // "auto" tells llama.cpp to fit as many layers as possible in VRAM,
    // and automatically offload remaining layers to system RAM
    // This enables running large models (e.g., 32B) on GPUs with limited VRAM
    const model = await this.llama.loadModel({
      modelPath,
      gpuLayers: "auto", // Automatically split between VRAM and RAM
    });

    return { model };
  }

  /**
   * Resolve model path from URI
   * Handles both Hugging Face URIs and local file:// URIs
   */
  private async resolveModelPath(uri: string): Promise<string> {
    // Check if it's a custom local file (file:// URI) or Hugging Face URI
    if (uri.startsWith("file://")) {
      // Custom model: extract filename and build path
      const filename = uri.replace("file://", "");
      return path.join(this.modelsDir, filename);
    } else {
      // Standard Hugging Face model
      return await resolveModelFile(uri, this.modelsDir);
    }
  }

  /**
   * Get the current models directory
   */
  getModelsDir(): string {
    return this.modelsDir;
  }

  /**
   * Update the models directory path
   */
  setModelsDir(modelsDir: string): void {
    this.modelsDir = modelsDir;
  }
}
