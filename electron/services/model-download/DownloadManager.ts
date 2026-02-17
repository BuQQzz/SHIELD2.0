import { createModelDownloader, type ModelDownloader } from "node-llama-cpp";
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
  downloader: ModelDownloader | null;
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
  private lastProgressEmitTime: Map<string, number> = new Map();
  private lastProgressEmitPercent: Map<string, number> = new Map();
  private static readonly PROGRESS_EMIT_INTERVAL_MS = 250;
  private static readonly PROGRESS_EMIT_MIN_DELTA = 0.5;

  constructor(private getModelsDir: () => string) {}

  /**
   * Set the main window for IPC communication
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    console.log("[DownloadManager] Main window set for progress updates");
  }

  /**
   * Set the HuggingFace token for authenticated downloads
   * Also sets HF_TOKEN environment variable as fallback for node-llama-cpp internals
   */
  setHuggingFaceToken(token: string | undefined) {
    this.huggingFaceToken = token;
    // Set environment variable as fallback - node-llama-cpp's manifest fetch may use this
    if (token) {
      process.env.HF_TOKEN = token;
      console.log("[DownloadManager] HF_TOKEN environment variable set");
    } else {
      delete process.env.HF_TOKEN;
      console.log("[DownloadManager] HF_TOKEN environment variable cleared");
    }
  }

  /**
   * Send progress update to renderer via IPC
   */
  private sendProgress(progress: DownloadProgress) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("model:download-progress", progress);
    } else {
      console.warn(
        "[DownloadManager] Cannot send progress - mainWindow not set or destroyed"
      );
    }
  }

  private shouldEmitProgress(progress: DownloadProgress): boolean {
    if (progress.status !== "downloading") {
      return true;
    }

    const now = Date.now();
    const lastTime = this.lastProgressEmitTime.get(progress.modelId) ?? 0;
    const lastPercent = this.lastProgressEmitPercent.get(progress.modelId) ?? 0;
    const percentDelta = Math.abs(progress.progress - lastPercent);

    return (
      now - lastTime >= DownloadManager.PROGRESS_EMIT_INTERVAL_MS ||
      percentDelta >= DownloadManager.PROGRESS_EMIT_MIN_DELTA
    );
  }

  private emitProgress(progress: DownloadProgress) {
    if (!this.shouldEmitProgress(progress)) {
      return;
    }

    this.lastProgressEmitTime.set(progress.modelId, Date.now());
    this.lastProgressEmitPercent.set(progress.modelId, progress.progress);
    this.sendProgress(progress);
    this.downloadHistory.set(progress.modelId, { ...progress });
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
      downloader: null,
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
      this.emitProgress(progress);

      const modelPath = await this.downloadWithProgress(model, task, progress);

      // Download completed successfully
      console.log(
        `[DownloadManager] Download completed for ${model.id}, sending completion event`
      );
      progress.status = "completed";
      progress.progress = 100;
      this.emitProgress(progress);
      console.log(`[DownloadManager] Completion event sent for ${model.id}`);
      this.activeDownloads.delete(model.id);
      this.lastProgressEmitTime.delete(model.id);
      this.lastProgressEmitPercent.delete(model.id);

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

      this.emitProgress(progress);
      this.activeDownloads.delete(model.id);
      this.lastProgressEmitTime.delete(model.id);
      this.lastProgressEmitPercent.delete(model.id);

      throw error;
    }
  }

  /**
   * Download with progress tracking using node-llama-cpp's createModelDownloader
   */
  private async downloadWithProgress(
    model: ModelMetadata,
    task: DownloadTask,
    progress: DownloadProgress
  ): Promise<string> {
    const modelsDir = this.getModelsDir();
    console.log(`[DownloadManager] Downloading ${model.displayName}...`);
    console.log(`[DownloadManager] URI: ${model.uri}`);
    console.log(`[DownloadManager] Target: ${modelsDir}`);

    // Debug token info (masked for security)
    const tokenInfo = this.huggingFaceToken
      ? `Configured (${this.huggingFaceToken.substring(0, 4)}...${this.huggingFaceToken.substring(this.huggingFaceToken.length - 4)}, length: ${this.huggingFaceToken.length})`
      : "Not set";
    console.log(`[DownloadManager] HF Token: ${tokenInfo}`);

    let lastUpdateTime = Date.now();
    let lastDownloadedBytes = 0;

    // Create model downloader with proper options
    const downloader = await createModelDownloader({
      modelUri: model.uri,
      dirPath: modelsDir,
      showCliProgress: false, // We handle our own progress
      deleteTempFileOnCancel: true, // Clean up .ipull files on cancel
      parallelDownloads: 2,
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

        this.emitProgress(progress);

        lastUpdateTime = currentTime;
        lastDownloadedBytes = totalDownloaded;
      },
      // Always include tokens object if we have an HF token
      tokens: this.huggingFaceToken
        ? { huggingFace: this.huggingFaceToken }
        : undefined,
    });

    // Store the downloader reference for cancellation
    task.downloader = downloader;

    console.log(`[DownloadManager] Total size: ${downloader.totalSize} bytes`);
    console.log(`[DownloadManager] Total files: ${downloader.totalFiles}`);

    // Start the download with abort signal support
    const modelPath = await downloader.download({
      signal: task.abortController.signal,
    });

    console.log(`[DownloadManager] Download complete: ${modelPath}`);
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

    console.log(`[DownloadManager] Cancelling download for ${modelId}`);

    // Use the downloader's cancel method if available (cleans up .ipull files)
    if (task.downloader) {
      try {
        await task.downloader.cancel({ deleteTempFile: true });
        console.log(`[DownloadManager] Downloader cancelled for ${modelId}`);
      } catch (error) {
        console.warn(
          `[DownloadManager] Error during downloader cancel:`,
          error
        );
      }
    }

    // Also abort the controller as a fallback
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

    this.emitProgress(progress);

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
