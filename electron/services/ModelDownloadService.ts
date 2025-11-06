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
import {
  DownloadProgressTracker,
  type DownloadProgress,
} from "./DownloadProgressTracker";
import { ModelFileManager } from "./ModelFileManager";

export type { DownloadProgress };

export interface DownloadTask {
  model: ModelMetadata;
  abortController: AbortController;
  progressTracker: DownloadProgressTracker;
}

class ModelDownloadService {
  private defaultModelsDir: string;
  private customModelsDir: string | undefined;
  private activeDownloads: Map<string, DownloadTask> = new Map();
  private downloadHistory: Map<string, DownloadProgress> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private fileManager: ModelFileManager;

  constructor(userDataPath: string) {
    this.defaultModelsDir = path.join(userDataPath, "models");
    this.fileManager = new ModelFileManager(() => this.getModelsDir());
    this.ensureModelsDirectory();
  }

  /**
   * Get the current models directory (custom or default)
   */
  private getModelsDir(): string {
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
      const modelsDir = this.getModelsDir();
      await fs.mkdir(modelsDir, { recursive: true });
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
    const progressTracker = new DownloadProgressTracker(
      model.id,
      (progress) => {
        this.sendProgress(progress);
        this.downloadHistory.set(model.id, progress);
      }
    );

    const task: DownloadTask = {
      model,
      abortController,
      progressTracker,
    };

    this.activeDownloads.set(model.id, task);

    try {
      // Send initial progress
      this.sendProgress(progressTracker.createInitialProgress());

      // Download the model
      const modelPath = await this.downloadWithProgress(
        model,
        abortController.signal,
        progressTracker
      );

      // Download completed successfully
      const completedProgress = progressTracker.createCompletedProgress();
      this.sendProgress(completedProgress);
      this.downloadHistory.set(model.id, completedProgress);
      this.activeDownloads.delete(model.id);

      return modelPath;
    } catch (error: unknown) {
      // Download failed or cancelled
      const err = error as Error & { name?: string };
      let errorProgress: DownloadProgress;

      if (err.name === "AbortError" || abortController.signal.aborted) {
        errorProgress = progressTracker.createCancelledProgress();
      } else {
        errorProgress = progressTracker.createErrorProgress(
          err.message || "Unknown error occurred"
        );
      }

      this.sendProgress(errorProgress);
      this.downloadHistory.set(model.id, errorProgress);
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
    progressTracker: DownloadProgressTracker
  ): Promise<string> {
    const modelsDir = this.getModelsDir();
    console.log(`Downloading ${model.displayName}...`);
    console.log(`URI: ${model.uri}`);
    console.log(`Target: ${modelsDir}`);

    const modelPath = await resolveModelFile(model.uri, {
      directory: modelsDir,
      onProgress: (status) => {
        // Update progress using the tracker
        progressTracker.update(status.downloadedSize, status.totalSize);
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

    const cancelledProgress = task.progressTracker.createCancelledProgress();
    this.sendProgress(cancelledProgress);
    this.downloadHistory.set(modelId, cancelledProgress);

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
