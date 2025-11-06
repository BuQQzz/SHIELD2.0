/**
 * Tests for DownloadProgressTracker
 */

import { describe, it, expect, vi } from "vitest";
import { DownloadProgressTracker } from "./DownloadProgressTracker";

describe("DownloadProgressTracker", () => {
  it("should create initial progress state", () => {
    const onProgress = vi.fn();
    const tracker = new DownloadProgressTracker("test-model", onProgress);

    const initialProgress = tracker.createInitialProgress();

    expect(initialProgress).toEqual({
      modelId: "test-model",
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
    });
  });

  it("should create completed progress state", () => {
    const onProgress = vi.fn();
    const tracker = new DownloadProgressTracker("test-model", onProgress);

    const completedProgress = tracker.createCompletedProgress();

    expect(completedProgress).toEqual({
      modelId: "test-model",
      status: "completed",
      progress: 100,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
    });
  });

  it("should create error progress state", () => {
    const onProgress = vi.fn();
    const tracker = new DownloadProgressTracker("test-model", onProgress);

    const errorProgress = tracker.createErrorProgress("Test error");

    expect(errorProgress).toEqual({
      modelId: "test-model",
      status: "error",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      error: "Test error",
    });
  });

  it("should create cancelled progress state", () => {
    const onProgress = vi.fn();
    const tracker = new DownloadProgressTracker("test-model", onProgress);

    const cancelledProgress = tracker.createCancelledProgress();

    expect(cancelledProgress).toEqual({
      modelId: "test-model",
      status: "cancelled",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      error: "Cancelled by user",
    });
  });

  it("should calculate progress percentage correctly", () => {
    const onProgress = vi.fn();
    const tracker = new DownloadProgressTracker("test-model", onProgress);

    // Simulate download progress: 50MB out of 100MB
    tracker.update(50 * 1024 * 1024, 100 * 1024 * 1024);

    expect(onProgress).toHaveBeenCalled();
    const progress = onProgress.mock.calls[0]?.[0];
    expect(progress?.progress).toBe(50);
    expect(progress?.downloadedBytes).toBe(50 * 1024 * 1024);
    expect(progress?.totalBytes).toBe(100 * 1024 * 1024);
  });

  it("should calculate speed and ETA", () => {
    const onProgress = vi.fn();
    const tracker = new DownloadProgressTracker("test-model", onProgress);

    // First update
    tracker.update(10 * 1024 * 1024, 100 * 1024 * 1024);
    
    // Second update after some time
    tracker.update(20 * 1024 * 1024, 100 * 1024 * 1024);

    expect(onProgress).toHaveBeenCalled();
    const progress = onProgress.mock.calls[onProgress.mock.calls.length - 1]?.[0];
    expect(progress?.speed).toBeGreaterThan(0);
    expect(progress?.eta).toBeGreaterThan(0);
  });

  it("should reset tracker state", () => {
    const onProgress = vi.fn();
    const tracker = new DownloadProgressTracker("test-model", onProgress);

    // Simulate some progress
    tracker.update(50 * 1024 * 1024, 100 * 1024 * 1024);
    onProgress.mockClear();

    // Reset and start new download
    tracker.reset();
    tracker.update(10 * 1024 * 1024, 200 * 1024 * 1024);

    expect(onProgress).toHaveBeenCalled();
    const progress = onProgress.mock.calls[0]?.[0];
    expect(progress?.downloadedBytes).toBe(10 * 1024 * 1024);
    expect(progress?.totalBytes).toBe(200 * 1024 * 1024);
  });
});
