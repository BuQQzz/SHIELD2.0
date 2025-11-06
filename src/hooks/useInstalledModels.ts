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
        const processedModels = new Set<string>(); // Track models we've already added

        for (const filename of result.models) {
          // Find matching model in catalog
          const catalogEntry = MODEL_CATALOG.find((model) => {
            // Extract expected filename from URI
            // Format: hf:Owner/Repo-Name-GGUF:Quantization
            const uriParts = model.uri.split(":");
            if (uriParts.length < 3) return false;

            const [, repoPath, quantization] = uriParts;
            if (!repoPath || !quantization) return false;

            // Extract owner and repo from path (e.g., "Qwen/Qwen2.5-7B-Instruct-GGUF")
            const [owner, repoName] = repoPath.split("/");
            if (!owner || !repoName) return false;

            // node-llama-cpp creates filenames in this format:
            // hf_Owner_Repo-Name.Quantization-00001-of-00002.gguf
            // Example: hf_Qwen_Qwen2.5-7B-Instruct.Q4_K_M-00001-of-00002.gguf

            // Remove -GGUF suffix from repo name if present
            const repoBaseName = repoName.replace(/-GGUF$/i, "");

            // Build the expected pattern
            const expectedPrefix = `hf_${owner}_${repoBaseName}.${quantization}`;

            // Check if filename starts with this pattern (ignoring split file suffix)
            const matched = filename
              .toLowerCase()
              .startsWith(expectedPrefix.toLowerCase());

            return matched;
          });

          if (catalogEntry) {
            // Check if we've already added this model (deduplicate split files)
            if (processedModels.has(catalogEntry.id)) {
              continue;
            }

            // Mark this model as processed
            processedModels.add(catalogEntry.id);

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

            // Extract base model name (remove split file suffix if present)
            const baseFilename = filename.replace(
              /-\d{5}-of-\d{5}\.gguf$/i,
              ""
            );
            const modelName = baseFilename.replace(/\.gguf$/i, "");

            // Check if we've already added this custom model (deduplicate splits)
            const customId = `custom-${modelName}`;
            if (processedModels.has(customId)) {
              continue;
            }

            processedModels.add(customId);

            const displayName = modelName
              .split(/[-._]/)
              .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
              .join(" ");

            installed.push({
              id: customId,
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
