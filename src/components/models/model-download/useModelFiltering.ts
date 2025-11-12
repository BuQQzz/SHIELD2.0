/**
 * Model Filtering Hook - Handles model filtering and grouping logic
 */

import { useMemo } from "react";
import type { ModelMetadata } from "@/config/models";
import type { FilterType } from "./types";

export function useModelFiltering(
  allModels: ModelMetadata[],
  filter: FilterType,
  searchQuery: string,
  isInstalled: (modelId: string) => boolean
) {
  // Filter models based on selected filter and search
  const filteredModels = useMemo(() => {
    let models = allModels;

    // Apply category filter
    switch (filter) {
      case "tool-calling":
        models = models.filter((m) => m.capabilities.toolCalling);
        break;
      case "coding":
        models = models.filter((m) => m.capabilities.codeGeneration);
        break;
      case "efficient":
        models = models.filter((m) => {
          const sizeGB = parseFloat(m.size);
          return sizeGB <= 5;
        });
        break;
      case "installed":
        models = models.filter((m) => isInstalled(m.id));
        break;
      // "all" - no filter
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      models = models.filter(
        (m) =>
          m.displayName.toLowerCase().includes(query) ||
          m.name.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query) ||
          m.provider.toLowerCase().includes(query)
      );
    }

    return models;
  }, [allModels, filter, searchQuery, isInstalled]);

  // Group models by category
  const groupedModels = useMemo(() => {
    const premium: ModelMetadata[] = [];
    const standard: ModelMetadata[] = [];
    const efficient: ModelMetadata[] = [];

    filteredModels.forEach((model) => {
      if (model.capabilities.toolCalling) {
        premium.push(model);
      } else {
        const sizeGB = parseFloat(model.size);
        if (sizeGB <= 5) {
          efficient.push(model);
        } else {
          standard.push(model);
        }
      }
    });

    return { premium, standard, efficient };
  }, [filteredModels]);

  return { filteredModels, groupedModels };
}
