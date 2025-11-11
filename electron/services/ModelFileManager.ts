/**
 * Model File Manager
 *
 * Handles model file system operations: checking installation, listing, deletion, and disk space
 */

import path from "path";
import fs from "fs/promises";
import type { ModelMetadata } from "../../src/config/models";

export class ModelFileManager {
  private defaultModelsDir: string;
  private customModelsDir: string | undefined;

  constructor(userDataPath: string) {
    this.defaultModelsDir = path.join(userDataPath, "models");
    this.ensureModelsDirectory();
  }

  /**
   * Get the current models directory (custom or default)
   */
  getModelsDir(): string {
    return this.customModelsDir || this.defaultModelsDir;
  }

  /**
   * Set custom models directory from settings
   */
  setCustomModelsDir(customPath: string | undefined) {
    this.customModelsDir = customPath;
    this.ensureModelsDirectory();
  }

  /**
   * Ensure models directory exists
   */
  private async ensureModelsDirectory() {
    try {
      const modelsDir = this.getModelsDir();
      await fs.mkdir(modelsDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create models directory:", error);
    }
  }

  /**
   * Check if a model is installed
   */
  async isModelInstalled(model: ModelMetadata): Promise<boolean> {
    try {
      // Check if model file exists in models directory
      // Extract model filename from URI: hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M
      const uriParts = model.uri.split(":");
      if (uriParts[0] !== "hf" || uriParts.length < 3) {
        return false;
      }

      const [, repoPath, quantization] = uriParts;
      const [_owner, repo] = repoPath.split("/");

      // Model files are typically named: {repo}-{quantization}.gguf
      // This is a simplification - actual naming may vary
      const possibleFilenames = [
        `${repo.toLowerCase()}.${quantization.toLowerCase()}.gguf`,
        `${repo}.${quantization}.gguf`,
      ];

      const modelsDir = this.getModelsDir();
      for (const filename of possibleFilenames) {
        const modelPath = path.join(modelsDir, filename);
        try {
          await fs.access(modelPath);
          return true; // File exists
        } catch {
          continue; // Try next filename
        }
      }

      // Also check if resolveModelFile can find it
      // Skip this check for now as it might trigger downloads
      // We'll rely on filesystem checks only
      return false;
    } catch (error) {
      console.error(`Error checking if model ${model.id} is installed:`, error);
      return false;
    }
  }

  /**
   * Get list of installed models
   */
  async listInstalledModels(): Promise<string[]> {
    try {
      const modelsDir = this.getModelsDir();
      const files = await fs.readdir(modelsDir);
      // Filter for .gguf files
      return files.filter((file) => file.endsWith(".gguf"));
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
      // Find the model file
      const uriParts = model.uri.split(":");
      if (uriParts[0] !== "hf" || uriParts.length < 3) {
        throw new Error("Invalid model URI");
      }

      const [, repoPath, quantization] = uriParts;
      const [_owner, repo] = repoPath.split("/");

      const possibleFilenames = [
        `${repo.toLowerCase()}.${quantization.toLowerCase()}.gguf`,
        `${repo}.${quantization}.gguf`,
      ];

      const modelsDir = this.getModelsDir();
      for (const filename of possibleFilenames) {
        const modelPath = path.join(modelsDir, filename);
        try {
          await fs.unlink(modelPath);
          console.log(`Deleted model: ${modelPath}`);
          return true;
        } catch {
          continue;
        }
      }

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
