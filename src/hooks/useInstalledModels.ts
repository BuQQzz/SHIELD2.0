import { useState, useEffect, useCallback } from "react";
import { getModelById, type ModelOption } from "@/config/models";

/**
 * Hook to fetch and manage list of installed models
 * Returns only models that are actually downloaded and available
 */
export function useInstalledModels() {
  const [installedModels, setInstalledModels] = useState<ModelOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);

      const result = await window.electronAPI.modelDownload.listInstalled();
      if (!result.success || !result.models) {
        console.error("Failed to load installed models:", result.error);
        setInstalledModels([]);
        return;
      }

      // Library model IDs, e.g. 'qwen3-coder-30b', 'gemma-4-12b'
      const installed: ModelOption[] = [];
      for (const modelId of result.models) {
        const catalogEntry = getModelById(modelId);
        if (!catalogEntry) {
          console.warn(
            `[useInstalledModels] Model ID ${modelId} not found in catalog`
          );
          continue;
        }
        installed.push({
          id: catalogEntry.id,
          name: catalogEntry.name,
          displayName: catalogEntry.displayName,
          uri: catalogEntry.uri,
          size: catalogEntry.size,
          description: catalogEntry.description,
          contextSize: catalogEntry.contextSize,
          capabilities: catalogEntry.capabilities,
          runtime: catalogEntry.runtime,
        });
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
  }, []);

  useEffect(() => {
    refresh();

    // Re-check installed models when downloads complete
    return window.electronAPI.modelDownload.onProgress((progress) => {
      if (progress.status === "completed") {
        refresh();
      }
    });
  }, [refresh]);

  return { installedModels, isLoading, refresh };
}
