/**
 * Model Download Service
 *
 * Handles downloading models from Hugging Face using node-llama-cpp
 * Provides progress tracking, cancellation, and error handling
 */

import { resolveModelFile } from "node-llama-cpp";
import { BrowserWindow } from "electron";
import type { ModelMetadata } from "../../src/config/models";
import {
  DownloadProgressTracker,
  type DownloadProgress,
} from "./DownloadProgressTracker";
import { ModelFileManager } from "./ModelFileManager";

export { type DownloadProgress } from "./DownloadProgressTracker";

export interface DownloadTask {
  model: ModelMetadata;
  abortController: AbortController;
  startTime: number;
  progressTracker: DownloadProgressTracker;
}

class ModelDownloadService {
  private activeDownloads: Map<string, DownloadTask> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private fileManager: ModelFileManager;

  constructor(userDataPath: string) {
    this.fileManager = new ModelFileManager(userDataPath);
  }

  /**
   * Set custom models directory from settings
   */
  setCustomModelsDir(customPath: string | undefined) {
    this.fileManager.setCustomModelsDir(customPath);
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
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
    const isInstalled = await this.fileManager.isModelInstalled(model);
    if (isInstalled) {
      throw new Error(`Model ${model.displayName} is already installed`);
    }

    const abortController = new AbortController();
    const progressTracker = new DownloadProgressTracker();
    const task: DownloadTask = {
      model,
      abortController,
      startTime: Date.now(),
      progressTracker,
    };

    this.activeDownloads.set(model.id, task);

    const initialProgress = progressTracker.createInitialProgress(model.id);

    try {
      this.sendProgress(initialProgress);

      // Use node-llama-cpp's resolveModelFile with progress tracking
      const modelPath = await this.downloadWithProgress(
        model,
        task,
        abortController.signal
      );

      // Download completed successfully
      const completedProgress = progressTracker.markCompleted(
        model.id,
        progressTracker.getProgress(model.id)?.totalBytes || 0
      );
      this.sendProgress(completedProgress);
      this.activeDownloads.delete(model.id);

      return modelPath;
    } catch (error: unknown) {
      // Download failed or cancelled
      const err = error as Error & { name?: string };
      let errorProgress: DownloadProgress;

      if (err.name === "AbortError" || abortController.signal.aborted) {
        errorProgress = progressTracker.markCancelled(model.id);
      } else {
        errorProgress = progressTracker.markError(
          model.id,
          err.message || "Unknown error occurred"
        );
      }

      this.sendProgress(errorProgress);
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
    task: DownloadTask,
    signal: AbortSignal
  ): Promise<string> {
    const modelsDir = this.fileManager.getModelsDir();
    console.log(`Downloading ${model.displayName}...`);
    console.log(`URI: ${model.uri}`);
    console.log(`Target: ${modelsDir}`);

    task.progressTracker.reset();

    const modelPath = await resolveModelFile(model.uri, {
      directory: modelsDir,
      onProgress: (status) => {
        // status: { totalSize: number, downloadedSize: number }
        const progress = task.progressTracker.calculateProgress(
          model.id,
          status.downloadedSize,
          status.totalSize,
          task.startTime
        );

        this.sendProgress(progress);
      },
    });

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

    const progress = task.progressTracker.markCancelled(modelId);
    this.sendProgress(progress);

    return true;
  }

  /**
   * Get current download progress for a model
   */
  getDownloadProgress(modelId: string): DownloadProgress | null {
    // Check active downloads first
    const task = this.activeDownloads.get(modelId);
    if (task) {
      return task.progressTracker.getProgress(modelId);
    }

    // If not actively downloading, we don't have historical data
    // This is intentional - progress is only tracked during active downloads
    return null;
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
    return this.fileManager.isModelInstalled(model);
  }

  /**
   * Get list of installed models
   */
  async listInstalledModels(): Promise<string[]> {
    return this.fileManager.listInstalledModels();
  }

  /**
   * Delete a model
   */
  async deleteModel(model: ModelMetadata): Promise<boolean> {
    return this.fileManager.deleteModel(model);
  }

  /**
   * Get total disk space used by models
   */
  async getTotalDiskSpace(): Promise<number> {
    return this.fileManager.getTotalDiskSpace();
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
