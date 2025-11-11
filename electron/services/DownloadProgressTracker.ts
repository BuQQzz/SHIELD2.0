/**
 * Download Progress Tracker
 *
 * Handles download progress calculation, speed tracking, and ETA estimation
 */

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

export class DownloadProgressTracker {
  private lastUpdateTime: number = Date.now();
  private lastDownloadedBytes: number = 0;
  private progressHistory: Map<string, DownloadProgress> = new Map();

  /**
   * Calculate progress update with speed and ETA
   */
  calculateProgress(
    modelId: string,
    downloadedBytes: number,
    totalBytes: number,
    startTime: number
  ): DownloadProgress {
    const currentTime = Date.now();
    const timeDelta = (currentTime - this.lastUpdateTime) / 1000; // seconds

    // Calculate speed (bytes per second)
    const bytesDelta = downloadedBytes - this.lastDownloadedBytes;
    const speed = timeDelta > 0 ? bytesDelta / timeDelta : 0;

    // Calculate ETA (seconds)
    const remainingBytes = totalBytes - downloadedBytes;
    const eta = speed > 0 ? remainingBytes / speed : 0;

    const progress: DownloadProgress = {
      modelId,
      status: "downloading",
      progress: totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
      downloadedBytes,
      totalBytes,
      speed: Math.round(speed),
      eta: Math.round(eta),
    };

    this.lastUpdateTime = currentTime;
    this.lastDownloadedBytes = downloadedBytes;
    this.progressHistory.set(modelId, progress);

    return progress;
  }

  /**
   * Create initial progress state
   */
  createInitialProgress(modelId: string): DownloadProgress {
    const progress: DownloadProgress = {
      modelId,
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
    };

    this.progressHistory.set(modelId, progress);
    return progress;
  }

  /**
   * Mark download as completed
   */
  markCompleted(modelId: string, totalBytes: number): DownloadProgress {
    const progress: DownloadProgress = {
      modelId,
      status: "completed",
      progress: 100,
      downloadedBytes: totalBytes,
      totalBytes,
      speed: 0,
      eta: 0,
    };

    this.progressHistory.set(modelId, progress);
    return progress;
  }

  /**
   * Mark download as cancelled
   */
  markCancelled(modelId: string): DownloadProgress {
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

    this.progressHistory.set(modelId, progress);
    return progress;
  }

  /**
   * Mark download as error
   */
  markError(modelId: string, error: string): DownloadProgress {
    const lastProgress = this.progressHistory.get(modelId);
    const progress: DownloadProgress = {
      modelId,
      status: "error",
      progress: lastProgress?.progress || 0,
      downloadedBytes: lastProgress?.downloadedBytes || 0,
      totalBytes: lastProgress?.totalBytes || 0,
      speed: 0,
      eta: 0,
      error,
    };

    this.progressHistory.set(modelId, progress);
    return progress;
  }

  /**
   * Get progress for a specific model
   */
  getProgress(modelId: string): DownloadProgress | null {
    return this.progressHistory.get(modelId) || null;
  }

  /**
   * Reset tracking state for a new download
   */
  reset() {
    this.lastUpdateTime = Date.now();
    this.lastDownloadedBytes = 0;
  }
}
