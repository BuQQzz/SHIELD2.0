import path from "path";
import fs from "fs/promises";
import type { ModelMetadata } from "../../../src/config/models";

/**
 * Manages model file operations (checking, listing, deleting)
 */
export class ModelFileManager {
  constructor(private getModelsDir: () => string) {}

  /**
   * Generate possible filenames for a model based on its URI
   * node-llama-cpp uses format: hf_Owner_RepoName.Quantization.gguf
   * Example: hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M -> hf_Qwen_Qwen2.5-3B-Instruct.Q4_K_M.gguf
   */
  private getPossibleFilenames(model: ModelMetadata): string[] {
    const uriParts = model.uri.split(":");
    if (uriParts[0] !== "hf" || uriParts.length < 3) {
      return [];
    }

    const [, repoPath, quantization] = uriParts;
    const [owner, repo] = repoPath.split("/");
    
    // Remove -GGUF suffix from repo name if present (node-llama-cpp does this)
    const cleanRepo = repo.replace(/-GGUF$/i, "");

    // node-llama-cpp naming convention: hf_{owner}_{repo}.{quantization}.gguf
    return [
      `hf_${owner}_${cleanRepo}.${quantization}.gguf`,
      `hf_${owner}_${repo}.${quantization}.gguf`,
      // Legacy patterns (in case older downloads exist)
      `${repo.toLowerCase()}.${quantization.toLowerCase()}.gguf`,
      `${repo}.${quantization}.gguf`,
    ];
  }

  /**
   * Check if a model is installed
   */
  async isModelInstalled(model: ModelMetadata): Promise<boolean> {
    try {
      const possibleFilenames = this.getPossibleFilenames(model);
      if (possibleFilenames.length === 0) return false;

      const modelsDir = this.getModelsDir();
      for (const filename of possibleFilenames) {
        const modelPath = path.join(modelsDir, filename);
        try {
          await fs.access(modelPath);
          console.log(`[ModelFileManager] Found model file: ${modelPath}`);
          return true;
        } catch {
          continue;
        }
      }

      return false;
    } catch (error) {
      console.error(`Error checking if model ${model.id} is installed:`, error);
      return false;
    }
  }

  /**
   * Get list of installed models
   * Returns model IDs (not filenames) by checking each catalog model against installed files
   */
  async listInstalledModels(): Promise<string[]> {
    try {
      const modelsDir = this.getModelsDir();
      const files = await fs.readdir(modelsDir);
      const ggufFiles = files.filter((file) => file.endsWith(".gguf"));
      
      // We need to import MODEL_CATALOG to map filenames back to model IDs
      // For now, return the filenames - the caller should use isModelInstalled() for each model
      return ggufFiles;
    } catch (error) {
      console.error("Error listing installed models:", error);
      return [];
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(model: ModelMetadata): Promise<boolean> {
    try {
      const possibleFilenames = this.getPossibleFilenames(model);
      if (possibleFilenames.length === 0) {
        throw new Error("Invalid model URI - cannot determine filename");
      }

      const modelsDir = this.getModelsDir();
      console.log(`[ModelFileManager] Attempting to delete model ${model.id}`);
      console.log(`[ModelFileManager] Looking in: ${modelsDir}`);
      console.log(`[ModelFileManager] Possible filenames:`, possibleFilenames);

      for (const filename of possibleFilenames) {
        const modelPath = path.join(modelsDir, filename);
        try {
          await fs.access(modelPath); // Check if file exists first
          await fs.unlink(modelPath);
          console.log(`[ModelFileManager] Deleted model: ${modelPath}`);
          return true;
        } catch {
          continue;
        }
      }

      // If we get here, no file was found
      console.warn(`[ModelFileManager] No matching file found for model ${model.id}`);
      return false;
    } catch (error) {
      console.error(`Error deleting model ${model.id}:`, error);
      return false;
    }
  }

  /**
   * Get total disk space used by models
   */
  async getTotalDiskSpace(): Promise<number> {
    try {
      const modelsDir = this.getModelsDir();
      const files = await fs.readdir(modelsDir);
      let totalSize = 0;

      for (const file of files) {
        if (file.endsWith(".gguf")) {
          const filePath = path.join(modelsDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      console.error("Error calculating disk space:", error);
      return 0;
    }
  }
}
