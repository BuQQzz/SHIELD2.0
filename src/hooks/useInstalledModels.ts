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

        // Get list of installed model files
        const result = await window.electronAPI.modelDownload.listInstalled();

        if (!result.success || !result.models) {
          console.error("Failed to load installed models:", result.error);
          setInstalledModels([]);
          return;
        }

        // Map installed files to MODEL_CATALOG entries
        const installed: ModelOption[] = [];

        for (const filename of result.models) {
          // Find matching model in catalog
          const catalogEntry = MODEL_CATALOG.find((model) => {
            // Extract expected filename from URI
            // Format: hf:Owner/Repo-Name-GGUF:Quantization
            const uriParts = model.uri.split(":");
            if (uriParts.length < 3) return false;

            const [, repoPath, quantization] = uriParts;
            if (!repoPath || !quantization) return false;

            // Extract repo name from path (e.g., "Qwen/Qwen2.5-7B-Instruct-GGUF" -> "Qwen2.5-7B-Instruct-GGUF")
            const repoParts = repoPath.split("/");
            const repoName = repoParts[repoParts.length - 1];
            if (!repoName) return false;

            // Generate possible filename patterns
            // node-llama-cpp typically creates filenames like: "qwen2.5-7b-instruct-gguf.q4_k_m.gguf"
            const baseNames = [
              repoName.toLowerCase().replace(/-gguf$/, ""),
              repoName.toLowerCase(),
              repoName.replace(/-GGUF$/, ""),
            ];

            const quantLower = quantization.toLowerCase();

            // Check various common patterns
            for (const baseName of baseNames) {
              const patterns = [
                `${baseName}.${quantLower}.gguf`,
                `${baseName}-${quantLower}.gguf`,
                `${baseName}_${quantLower}.gguf`,
                `${baseName.replace(/-/g, "_")}.${quantLower}.gguf`,
              ];

              if (patterns.some((p) => filename.toLowerCase() === p)) {
                return true;
              }
            }

            return false;
          });

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
            // Unknown model - create a basic entry for it
            // This allows users to use any .gguf model they've added manually
            const modelName = filename.replace(/\.gguf$/i, "");
            const displayName = modelName
              .split(/[-._]/)
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" ");

            console.log(
              `[useInstalledModels] Adding unknown model: ${filename}`
            );

            installed.push({
              id: `custom-${modelName}`,
              name: modelName,
              displayName: displayName,
              uri: `file://${filename}`, // Use file:// to indicate it's a local file
              size: "Unknown",
              description: "Custom model (not in catalog)",
              contextSize: 4096, // Default context size
              capabilities: {
                toolCalling: false,
                complexReasoning: true,
                webSearch: true,
                structuredOutput: false,
                longContext: false,
                codeGeneration: true,
                multilingual: "basic" as const,
                temperatureRange: { min: 0.1, max: 1.5, default: 0.7 },
              },
            });
          }
        }

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
