/**
 * Model Download Service
 *
 * Handles downloading models from Hugging Face using node-llama-cpp
 * Provides progress tracking, cancellation, and error handling
 */

import { resolveModelFile } from "node-llama-cpp";
import path from "path";
import fs from "fs/promises";
import { BrowserWindow } from "electron";
import type { ModelMetadata } from "../../src/config/models";

export interface DownloadProgress {
  modelId: string;
  status: "downloading" | "completed" | "error" | "cancelled";
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  error?: string;
}

export interface DownloadTask {
  model: ModelMetadata;
  abortController: AbortController;
  startTime: number;
}

class ModelDownloadService {
  private modelsDir: string;
  private activeDownloads: Map<string, DownloadTask> = new Map();
  private downloadHistory: Map<string, DownloadProgress> = new Map();
  private mainWindow: BrowserWindow | null = null;

  constructor(userDataPath: string) {
    this.modelsDir = path.join(userDataPath, "models");
    this.ensureModelsDirectory();
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * Ensure models directory exists
   */
  private async ensureModelsDirectory() {
    try {
      await fs.mkdir(this.modelsDir, { recursive: true });
    } catch (error) {
      console.error("Failed to create models directory:", error);
    }
  }

  /**
   * Send progress update to renderer via IPC
   */
  private sendProgress(progress: DownloadProgress) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("model:download-progress", progress);
    }
  }

  /**
   * Download a model from Hugging Face
   */
  async downloadModel(model: ModelMetadata): Promise<string> {
    // Check if already downloading
    if (this.activeDownloads.has(model.id)) {
      throw new Error(`Model ${model.displayName} is already downloading`);
    }

    // Check if model already exists
    const isInstalled = await this.isModelInstalled(model);
    if (isInstalled) {
      throw new Error(`Model ${model.displayName} is already installed`);
    }

    const abortController = new AbortController();
    const task: DownloadTask = {
      model,
      abortController,
      startTime: Date.now(),
    };

    this.activeDownloads.set(model.id, task);

    const progress: DownloadProgress = {
      modelId: model.id,
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
    };

    try {
      this.sendProgress(progress);

      // Use node-llama-cpp's resolveModelFile with progress tracking
      // Note: We'll need to wrap this with a custom progress tracker
      const modelPath = await this.downloadWithProgress(
        model,
        abortController.signal,
        (downloadedBytes: number, totalBytes: number) => {
          const elapsedSeconds = (Date.now() - task.startTime) / 1000;
          const speed = downloadedBytes / elapsedSeconds;
          const remainingBytes = totalBytes - downloadedBytes;
          const eta = speed > 0 ? remainingBytes / speed : 0;

          progress.progress = Math.round((downloadedBytes / totalBytes) * 100);
          progress.downloadedBytes = downloadedBytes;
          progress.totalBytes = totalBytes;
          progress.speed = speed;
          progress.eta = eta;

          this.sendProgress(progress);
        }
      );

      // Download completed successfully
      progress.status = "completed";
      progress.progress = 100;
      this.sendProgress(progress);
      this.downloadHistory.set(model.id, progress);
      this.activeDownloads.delete(model.id);

      return modelPath;
    } catch (error: any) {
      // Download failed or cancelled
      if (error.name === "AbortError" || abortController.signal.aborted) {
        progress.status = "cancelled";
        progress.error = "Download cancelled by user";
      } else {
        progress.status = "error";
        progress.error = error.message || "Unknown error occurred";
      }

      this.sendProgress(progress);
      this.downloadHistory.set(model.id, progress);
      this.activeDownloads.delete(model.id);

      throw error;
    }
  }

  /**
   * Download with progress tracking
   * Wraps node-llama-cpp's resolveModelFile
   */
  private async downloadWithProgress(
    model: ModelMetadata,
    signal: AbortSignal,
    onProgress: (downloaded: number, total: number) => void
  ): Promise<string> {
    console.log(`Downloading ${model.displayName}...`);
    console.log(`URI: ${model.uri}`);
    console.log(`Target: ${this.modelsDir}`);

    // node-llama-cpp's resolveModelFile handles progress internally
    // For now, we'll use it directly and enhance with custom tracking later
    const modelPath = await resolveModelFile(model.uri, {
      directory: this.modelsDir,
      // downloadOptions: { signal }, // Add when supported
    });

    // TODO: Implement custom progress tracking by:
    // 1. Intercepting HTTP download stream
    // 2. Tracking bytes downloaded
    // 3. Calling onProgress callback
    // For MVP, we'll simulate progress based on file size estimation

    return modelPath;
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(modelId: string): Promise<boolean> {
    const task = this.activeDownloads.get(modelId);
    if (!task) {
      return false;
    }

    task.abortController.abort();
    this.activeDownloads.delete(modelId);

    const progress: DownloadProgress = {
      modelId,
      status: "cancelled",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      error: "Cancelled by user",
    };

    this.sendProgress(progress);
    this.downloadHistory.set(modelId, progress);

    return true;
  }

  /**
   * Get current download progress for a model
   */
  getDownloadProgress(modelId: string): DownloadProgress | null {
    return this.downloadHistory.get(modelId) || null;
  }

  /**
   * Get all active downloads
   */
  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
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
      const [owner, repo] = repoPath.split("/");

      // Model files are typically named: {repo}-{quantization}.gguf
      // This is a simplification - actual naming may vary
      const possibleFilenames = [
        `${repo.toLowerCase()}.${quantization.toLowerCase()}.gguf`,
        `${repo}.${quantization}.gguf`,
      ];

      for (const filename of possibleFilenames) {
        const modelPath = path.join(this.modelsDir, filename);
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
      const files = await fs.readdir(this.modelsDir);
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
      const [owner, repo] = repoPath.split("/");

      const possibleFilenames = [
        `${repo.toLowerCase()}.${quantization.toLowerCase()}.gguf`,
        `${repo}.${quantization}.gguf`,
      ];

      for (const filename of possibleFilenames) {
        const modelPath = path.join(this.modelsDir, filename);
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
      const files = await fs.readdir(this.modelsDir);
      let totalSize = 0;

      for (const file of files) {
        if (file.endsWith(".gguf")) {
          const filePath = path.join(this.modelsDir, file);
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

// Export singleton instance
let serviceInstance: ModelDownloadService | null = null;

export function getModelDownloadService(
  userDataPath: string
): ModelDownloadService {
  if (!serviceInstance) {
    serviceInstance = new ModelDownloadService(userDataPath);
  }
  return serviceInstance;
}

export { ModelDownloadService };
