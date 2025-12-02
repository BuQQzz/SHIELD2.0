import { resolveModelFile } from "node-llama-cpp";
import { BrowserWindow } from "electron";
import type { ModelMetadata } from "../../../src/config/models";

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

export interface DownloadOptions {
  huggingFaceToken?: string;
}

/**
 * Manages active downloads and progress tracking
 */
export class DownloadManager {
  private activeDownloads: Map<string, DownloadTask> = new Map();
  private downloadHistory: Map<string, DownloadProgress> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private huggingFaceToken: string | undefined;

  constructor(private getModelsDir: () => string) { }

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * Set the HuggingFace token for authenticated downloads
   */
  setHuggingFaceToken(token: string | undefined) {
    this.huggingFaceToken = token;
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
   * Check if a model is currently downloading
   */
  isDownloading(modelId: string): boolean {
    return this.activeDownloads.has(modelId);
  }

  /**
   * Download a model with progress tracking
   */
  async download(model: ModelMetadata): Promise<string> {
    if (this.activeDownloads.has(model.id)) {
      throw new Error(`Model ${model.displayName} is already downloading`);
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

      const modelPath = await this.downloadWithProgress(model, task, progress);

      // Download completed successfully
      progress.status = "completed";
      progress.progress = 100;
      this.sendProgress(progress);
      this.downloadHistory.set(model.id, progress);
      this.activeDownloads.delete(model.id);

      return modelPath;
    } catch (error: unknown) {
      // Download failed or cancelled
      const err = error as Error & { name?: string };
      if (err.name === "AbortError" || abortController.signal.aborted) {
        progress.status = "cancelled";
        progress.error = "Download cancelled by user";
      } else {
        progress.status = "error";
        progress.error = err.message || "Unknown error occurred";
      }

      this.sendProgress(progress);
      this.downloadHistory.set(model.id, progress);
      this.activeDownloads.delete(model.id);

      throw error;
    }
  }

  /**
   * Download with progress tracking using node-llama-cpp
   */
  private async downloadWithProgress(
    model: ModelMetadata,
    task: DownloadTask,
    progress: DownloadProgress
  ): Promise<string> {
    const modelsDir = this.getModelsDir();
    console.log(`Downloading ${model.displayName}...`);
    console.log(`URI: ${model.uri}`);
    console.log(`Target: ${modelsDir}`);
    console.log(`HF Token: ${this.huggingFaceToken ? "Configured" : "Not set"}`);

    let lastUpdateTime = Date.now();
    let lastDownloadedBytes = 0;

    // Build download options with token if available
    const downloadOptions: {
      directory: string;
      onProgress: (status: { downloadedSize: number; totalSize: number }) => void;
      tokens?: { huggingFace?: string };
    } = {
      directory: modelsDir,
      onProgress: (status) => {
        const currentTime = Date.now();
        const timeDelta = (currentTime - lastUpdateTime) / 1000;

        const totalDownloaded = status.downloadedSize;
        const totalSize = status.totalSize;

        // Calculate speed (bytes per second)
        const bytesDelta = totalDownloaded - lastDownloadedBytes;
        const speed = timeDelta > 0 ? bytesDelta / timeDelta : 0;

        // Calculate ETA (seconds)
        const remainingBytes = totalSize - totalDownloaded;
        const eta = speed > 0 ? remainingBytes / speed : 0;

        // Update progress
        progress.progress =
          totalSize > 0 ? (totalDownloaded / totalSize) * 100 : 0;
        progress.downloadedBytes = totalDownloaded;
        progress.totalBytes = totalSize;
        progress.speed = Math.round(speed);
        progress.eta = Math.round(eta);

        this.sendProgress(progress);
        this.downloadHistory.set(model.id, progress);

        lastUpdateTime = currentTime;
        lastDownloadedBytes = totalDownloaded;
      },
    };

    // Add HuggingFace token if available
    if (this.huggingFaceToken) {
      downloadOptions.tokens = {
        huggingFace: this.huggingFaceToken,
      };
    }

    const modelPath = await resolveModelFile(model.uri, downloadOptions);

    return modelPath;
  }

  /**
   * Cancel an active download
   */
  async cancel(modelId: string): Promise<boolean> {
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
  getProgress(modelId: string): DownloadProgress | null {
    return this.downloadHistory.get(modelId) || null;
  }

  /**
   * Get all active downloads
   */
  getActiveDownloads(): string[] {
    return Array.from(this.activeDownloads.keys());
  }
}
