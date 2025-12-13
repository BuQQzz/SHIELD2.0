import { useState, useEffect, useCallback, useRef } from "react";
import { type ModelMetadata } from "@/config/models";
import { type DownloadProgress } from "@/types/electron";

interface UseModelDownloadOptions {
  onComplete?: (modelId: string) => void;
  onError?: (modelId: string, error: string) => void;
}

export function useModelDownload(options: UseModelDownloadOptions = {}) {
  const [activeDownloads, setActiveDownloads] = useState<
    Map<string, DownloadProgress>
  >(new Map());
  const [installedModels, setInstalledModels] = useState<Set<string>>(
    new Set()
  );
  const cleanupRef = useRef<(() => void) | null>(null);

  // Use ref to avoid recreating listener when options change
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Initialize: Load installed models and setup progress listener
  useEffect(() => {
    const init = async () => {
      try {
        // Load installed models
        const result = await window.electronAPI.modelDownload.listInstalled();
        if (result.success && result.models) {
          setInstalledModels(new Set(result.models));
        }

        // Check for any active downloads and restore their progress
        // This ensures progress is shown even after navigating away and back
        const activeDownloadIds =
          await window.electronAPI.modelDownload.getActiveDownloads();
        if (activeDownloadIds && activeDownloadIds.length > 0) {
          const progressMap = new Map<string, DownloadProgress>();
          for (const modelId of activeDownloadIds) {
            const progressResult =
              await window.electronAPI.modelDownload.getProgress(modelId);
            if (progressResult.success && progressResult.progress) {
              progressMap.set(modelId, progressResult.progress);
            }
          }
          setActiveDownloads(progressMap);
        }
      } catch (error) {
        console.error("Failed to initialize model download state:", error);
      }
    };

    init();

    // Setup progress listener (only once on mount)
    cleanupRef.current = window.electronAPI.modelDownload.onProgress(
      (progress) => {
        console.log(
          `[useModelDownload] Progress received:`,
          progress.modelId,
          progress.status,
          progress.progress
        );

        if (progress.status === "completed") {
          console.log(
            `[useModelDownload] Download completed for ${progress.modelId}, updating state`
          );
          // Mark as installed immediately - do this OUTSIDE of setActiveDownloads to avoid timing issues
          setInstalledModels((installed) => {
            const next = new Set(installed);
            next.add(progress.modelId);
            console.log(
              `[useModelDownload] Added ${progress.modelId} to installedModels`
            );
            return next;
          });

          // Update active downloads with completed status
          setActiveDownloads((prev) => {
            const next = new Map(prev);
            next.set(progress.modelId, progress);
            return next;
          });

          // Remove from active downloads after a short delay to show "Downloaded" state
          setTimeout(() => {
            setActiveDownloads((current) => {
              const updated = new Map(current);
              updated.delete(progress.modelId);
              return updated;
            });
          }, 3000);

          optionsRef.current.onComplete?.(progress.modelId);
          return;
        }

        setActiveDownloads((prev) => {
          const next = new Map(prev);

          if (progress.status === "error") {
            optionsRef.current.onError?.(
              progress.modelId,
              progress.error || "Download failed"
            );
            // Remove from active downloads after delay
            setTimeout(() => {
              setActiveDownloads((current) => {
                const updated = new Map(current);
                updated.delete(progress.modelId);
                return updated;
              });
            }, 5000);
          } else if (progress.status === "cancelled") {
            // Remove immediately on cancellation
            next.delete(progress.modelId);
            return next;
          }

          next.set(progress.modelId, progress);
          return next;
        });
      }
    );

    // Cleanup listener on unmount
    return () => {
      cleanupRef.current?.();
    };
  }, []); // Empty deps - only setup once on mount

  // Start download
  const startDownload = useCallback(
    async (model: ModelMetadata) => {
      try {
        // Check if already installed
        if (installedModels.has(model.id)) {
          console.warn(`Model ${model.displayName} is already installed`);
          return;
        }

        // Check if already downloading
        const currentProgress = activeDownloads.get(model.id);
        if (currentProgress?.status === "downloading") {
          console.warn(`Model ${model.displayName} is already downloading`);
          return;
        }

        // Initialize progress
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.set(model.id, {
            modelId: model.id,
            status: "downloading",
            progress: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            speed: 0,
            eta: 0,
          });
          return next;
        });

        // Start download via IPC
        const result = await window.electronAPI.modelDownload.download(
          model.id
        );

        if (!result.success) {
          throw new Error(result.error || "Download failed");
        }

        // Download completed successfully - update state immediately
        // This handles the case where progress events aren't received (e.g., fast completion)
        console.log(
          `[useModelDownload] Download IPC returned success for ${model.id}`
        );

        // Mark as installed
        setInstalledModels((prev) => {
          const next = new Set(prev);
          next.add(model.id);
          return next;
        });

        // Update to completed status
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.set(model.id, {
            modelId: model.id,
            status: "completed",
            progress: 100,
            downloadedBytes: 0,
            totalBytes: 0,
            speed: 0,
            eta: 0,
          });
          return next;
        });

        // Remove from active downloads after showing "Downloaded" state
        setTimeout(() => {
          setActiveDownloads((current) => {
            const updated = new Map(current);
            updated.delete(model.id);
            return updated;
          });
        }, 3000);

        optionsRef.current.onComplete?.(model.id);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        setActiveDownloads((prev) => {
          const next = new Map(prev);
          next.set(model.id, {
            modelId: model.id,
            status: "error",
            progress: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            speed: 0,
            eta: 0,
            error: errorMessage,
          });
          return next;
        });
        optionsRef.current.onError?.(model.id, errorMessage);
      }
    },
    [installedModels, activeDownloads]
  );

  // Cancel download
  const cancelDownload = useCallback(async (modelId: string) => {
    try {
      await window.electronAPI.modelDownload.cancel(modelId);
      // Progress listener will handle removal
    } catch (error) {
      console.error("Failed to cancel download:", error);
    }
  }, []);

  // Delete model
  const deleteModel = useCallback(async (model: ModelMetadata) => {
    try {
      const result = await window.electronAPI.modelDownload.delete(model.id);
      if (result.success) {
        setInstalledModels((prev) => {
          const next = new Set(prev);
          next.delete(model.id);
          return next;
        });
      }
      return result;
    } catch (error) {
      console.error("Failed to delete model:", error);
      return { success: false, error: "Failed to delete model" };
    }
  }, []);

  // Check if model is installed
  const isInstalled = useCallback(
    (modelId: string) => {
      return installedModels.has(modelId);
    },
    [installedModels]
  );

  // Get download progress for a model
  const getProgress = useCallback(
    (modelId: string) => {
      return activeDownloads.get(modelId);
    },
    [activeDownloads]
  );

  // Check if model is downloading
  const isDownloading = useCallback(
    (modelId: string) => {
      const progress = activeDownloads.get(modelId);
      return progress?.status === "downloading";
    },
    [activeDownloads]
  );

  return {
    activeDownloads,
    installedModels,
    startDownload,
    cancelDownload,
    deleteModel,
    isInstalled,
    getProgress,
    isDownloading,
  };
}
