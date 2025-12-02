/**
 * Model Download Service
 *
 * Handles downloading models from Hugging Face using node-llama-cpp
 * Provides progress tracking, cancellation, and error handling
 */

import path from "path";
import fs from "fs/promises";
import { BrowserWindow } from "electron";
import type { ModelMetadata } from "../../src/config/models";
import {
  DownloadManager,
  type DownloadProgress,
} from "./model-download/DownloadManager";
import { ModelFileManager } from "./model-download/ModelFileManager";

export type { DownloadProgress };

class ModelDownloadService {
  private defaultModelsDir: string;
  private customModelsDir: string | undefined;
  private downloadManager: DownloadManager;
  private fileManager: ModelFileManager;

  constructor(userDataPath: string) {
    this.defaultModelsDir = path.join(userDataPath, "models");

    const getModelsDir = () => this.getModelsDir();
    this.downloadManager = new DownloadManager(getModelsDir);
    this.fileManager = new ModelFileManager(getModelsDir);

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
   * Set HuggingFace token for authenticated downloads
   */
  setHuggingFaceToken(token: string | undefined) {
    this.downloadManager.setHuggingFaceToken(token);
  }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow) {
    this.downloadManager.setMainWindow(window);
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
   * Download a model from Hugging Face
   */
  async downloadModel(model: ModelMetadata): Promise<string> {
    // Check if already downloading
    if (this.downloadManager.isDownloading(model.id)) {
      throw new Error(`Model ${model.displayName} is already downloading`);
    }

    // Check if model already exists
    const isInstalled = await this.isModelInstalled(model);
    if (isInstalled) {
      throw new Error(`Model ${model.displayName} is already installed`);
    }

    return this.downloadManager.download(model);
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(modelId: string): Promise<boolean> {
    return this.downloadManager.cancel(modelId);
  }

  /**
   * Get current download progress for a model
   */
  getDownloadProgress(modelId: string): DownloadProgress | null {
    return this.downloadManager.getProgress(modelId);
  }

  /**
   * Get all active downloads
   */
  getActiveDownloads(): string[] {
    return this.downloadManager.getActiveDownloads();
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
