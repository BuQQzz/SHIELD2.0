import { useState, useEffect } from "react";
import { MODEL_CATALOG } from "@/config/models";
import type { ModelOption } from "@/components/chat/ModelSelector";

/**
 * Hook to fetch and manage list of installed models
 * Returns only models that are actually downloaded and available
 */
export function useInstalledModels() {
  const [installedModels, setInstalledModels] = useState<ModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadInstalledModels = async () => {
      try {
        setIsLoading(true);

        // Get list of installed model IDs (not filenames anymore)
        const result = await window.electronAPI.modelDownload.listInstalled();

        if (!result.success || !result.models) {
          console.error("Failed to load installed models:", result.error);
          setInstalledModels([]);
          return;
        }

        // result.models now contains model IDs like 'qwen-3b', 'qwen-7b', etc.
        const installedModelIds = result.models;
        console.log(
          "[useInstalledModels] Installed model IDs:",
          installedModelIds
        );

        // Map installed model IDs to MODEL_CATALOG entries
        const installed: ModelOption[] = [];

        for (const modelId of installedModelIds) {
          // Find matching entry in MODEL_CATALOG by ID
          const catalogEntry = MODEL_CATALOG.find(
            (model) => model.id === modelId
          );

          if (catalogEntry) {
            // Convert to ModelOption format
            installed.push({
              id: catalogEntry.id,
              name: catalogEntry.name,
              displayName: catalogEntry.displayName,
              uri: catalogEntry.uri,
              size: catalogEntry.size,
              description: catalogEntry.description,
              contextSize: catalogEntry.contextSize,
              capabilities: catalogEntry.capabilities,
            });
          } else {
            console.warn(
              `[useInstalledModels] Model ID ${modelId} not found in catalog`
            );
          }
        }

        console.log(
          "[useInstalledModels] Loaded installed models:",
          installed.map((m) => m.displayName)
        );
        setInstalledModels(installed);
      } catch (error) {
        console.error("Error loading installed models:", error);
        setInstalledModels([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadInstalledModels();

    // Re-check installed models when downloads complete
    const cleanup = window.electronAPI.modelDownload.onProgress((progress) => {
      if (progress.status === "completed") {
        loadInstalledModels();
      }
    });

    return cleanup;
  }, []);

  return { installedModels, isLoading };
}
