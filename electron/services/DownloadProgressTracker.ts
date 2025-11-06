/**
 * Download Progress Tracker
 *
 * Handles progress calculation, speed tracking, and ETA estimation for model downloads
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
  private startTime: number = Date.now();

  constructor(
    private modelId: string,
    private onProgress: (progress: DownloadProgress) => void
  ) {}

  /**
   * Reset the tracker for a new download
   */
  reset() {
    this.lastUpdateTime = Date.now();
    this.lastDownloadedBytes = 0;
    this.startTime = Date.now();
  }

  /**
   * Update progress with new download status
   */
  update(downloadedBytes: number, totalBytes: number) {
    const currentTime = Date.now();
    const timeDelta = (currentTime - this.lastUpdateTime) / 1000; // seconds

    // Calculate instantaneous speed (bytes per second)
    const bytesDelta = downloadedBytes - this.lastDownloadedBytes;
    const instantaneousSpeed = timeDelta > 0 ? bytesDelta / timeDelta : 0;

    // Calculate average speed from start
    const elapsedSeconds = (currentTime - this.startTime) / 1000;
    const averageSpeed = elapsedSeconds > 0 ? downloadedBytes / elapsedSeconds : 0;

    // Use average speed for more stable ETA
    const speed = averageSpeed;

    // Calculate ETA (seconds)
    const remainingBytes = totalBytes - downloadedBytes;
    const eta = speed > 0 ? remainingBytes / speed : 0;

    // Calculate progress percentage
    const progressPercent = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0;

    const progress: DownloadProgress = {
      modelId: this.modelId,
      status: "downloading",
      progress: Math.round(progressPercent),
      downloadedBytes,
      totalBytes,
      speed: Math.round(speed),
      eta: Math.round(eta),
    };

    this.onProgress(progress);

    // Update tracking state
    this.lastUpdateTime = currentTime;
    this.lastDownloadedBytes = downloadedBytes;
  }

  /**
   * Create a completed progress object
   */
  createCompletedProgress(): DownloadProgress {
    return {
      modelId: this.modelId,
      status: "completed",
      progress: 100,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
    };
  }

  /**
   * Create an error progress object
   */
  createErrorProgress(errorMessage: string): DownloadProgress {
    return {
      modelId: this.modelId,
      status: "error",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      error: errorMessage,
    };
  }

  /**
   * Create a cancelled progress object
   */
  createCancelledProgress(): DownloadProgress {
    return {
      modelId: this.modelId,
      status: "cancelled",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      error: "Cancelled by user",
    };
  }

  /**
   * Create an initial progress object
   */
  createInitialProgress(): DownloadProgress {
    return {
      modelId: this.modelId,
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
    };
  }
}
