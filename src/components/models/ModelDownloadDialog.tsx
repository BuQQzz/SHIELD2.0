/**
 * Model Download Dialog
 *
 * Browse, filter, and download AI models from trusted sources
 * Shows model capabilities, hardware requirements, and download progress
 */

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { DeleteModelDialog } from "./DeleteModelDialog";
import { ModelDownloadFilters } from "./ModelDownloadFilters";
import { ModelDownloadBrowser } from "./ModelDownloadBrowser";
import { MODEL_CATALOG, type ModelMetadata } from "@/config/models";
import { useModelDownload } from "@/hooks/useModelDownload";

interface ModelDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FilterType = "all" | "tool-calling" | "coding" | "efficient" | "installed";

export function ModelDownloadDialog({
  open,
  onOpenChange,
}: ModelDownloadDialogProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modelToDelete, setModelToDelete] = useState<ModelMetadata | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Use download hook
  const {
    installedModels,
    startDownload,
    cancelDownload,
    deleteModel,
    isInstalled,
    getProgress,
  } = useModelDownload({
    onComplete: (modelId) => {
      const model = MODEL_CATALOG.find((m) => m.id === modelId);
      console.log(`Download complete: ${model?.displayName}`);
    },
    onError: (modelId, error) => {
      const model = MODEL_CATALOG.find((m) => m.id === modelId);
      console.error(`Download failed for ${model?.displayName}:`, error);
    },
  });

  // Handle delete confirmation
  const handleDeleteClick = (model: ModelMetadata) => {
    setModelToDelete(model);
  };

  const handleDeleteConfirm = async () => {
    if (!modelToDelete) return;

    setIsDeleting(true);
    try {
      const result = await deleteModel(modelToDelete);
      if (result.success) {
        console.log(`Model deleted: ${modelToDelete.displayName}`);
        setModelToDelete(null);
      } else {
        console.error(`Failed to delete model: ${result.error}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter models based on selected filter and search
  const filteredModels = useMemo(() => {
    let models = MODEL_CATALOG;

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
  }, [filter, searchQuery, isInstalled]);

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

  const totalModels = MODEL_CATALOG.length;
  const installedCount = installedModels.size;
  const toolCallingCount = MODEL_CATALOG.filter(
    (m) => m.capabilities.toolCalling
  ).length;

  // Handler to clear filters
  const handleClearFilters = () => {
    setFilter("all");
    setSearchQuery("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <ModelDownloadFilters
              filter={filter}
              searchQuery={searchQuery}
              totalModels={totalModels}
              installedCount={installedCount}
              toolCallingCount={toolCallingCount}
              onFilterChange={setFilter}
              onSearchChange={setSearchQuery}
            />
          </DialogHeader>

          {/* Model Grid */}
          <div className="flex-1 overflow-y-auto mt-4 -mx-6 px-6">
            <ModelDownloadBrowser
              premiumModels={groupedModels.premium}
              standardModels={groupedModels.standard}
              efficientModels={groupedModels.efficient}
              hasResults={filteredModels.length > 0}
              isInstalled={isInstalled}
              getProgress={getProgress}
              onDownload={startDownload}
              onCancel={cancelDownload}
              onDeleteClick={handleDeleteClick}
              onClearFilters={handleClearFilters}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteModelDialog
        open={!!modelToDelete}
        model={modelToDelete}
        onOpenChange={(open) => !open && setModelToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </>
  );
}
