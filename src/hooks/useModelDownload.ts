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

  // Initialize: Load installed models and setup progress listener
  useEffect(() => {
    const init = async () => {
      try {
        const result = await window.electronAPI.modelDownload.listInstalled();
        if (result.success && result.models) {
          setInstalledModels(new Set(result.models));
        }
      } catch (error) {
        console.error("Failed to load installed models:", error);
      }
    };

    init();

    // Setup progress listener
    cleanupRef.current = window.electronAPI.modelDownload.onProgress(
      (progress) => {
        setActiveDownloads((prev) => {
          const next = new Map(prev);

          if (progress.status === "completed") {
            // Mark as installed and remove from active downloads after delay
            setInstalledModels((installed) =>
              new Set(installed).add(progress.modelId)
            );
            setTimeout(() => {
              setActiveDownloads((current) => {
                const updated = new Map(current);
                updated.delete(progress.modelId);
                return updated;
              });
            }, 2000);

            options.onComplete?.(progress.modelId);
          } else if (progress.status === "error") {
            options.onError?.(
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
  }, [options]);

  // Start download
  const startDownload = useCallback(
    async (model: ModelMetadata) => {
      try {
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
        options.onError?.(model.id, errorMessage);
      }
    },
    [options]
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
