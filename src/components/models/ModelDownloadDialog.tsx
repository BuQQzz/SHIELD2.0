/**
 * Model Download Dialog
 *
 * Browse, filter, and download AI models from trusted sources
 * Shows model capabilities, hardware requirements, and download progress
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteModelDialog } from "./DeleteModelDialog";
import { MODEL_CATALOG, type ModelMetadata } from "@/config/models";
import { useModelDownload } from "@/hooks/useModelDownload";
import { FilterDropdown } from "./model-download/FilterDropdown";
import { SearchBar } from "./model-download/SearchBar";
import { ModelGrid } from "./model-download/ModelGrid";
import { useModelFiltering } from "./model-download/useModelFiltering";
import type { FilterType } from "./model-download/types";

interface ModelDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

  const { filteredModels, groupedModels } = useModelFiltering(
    MODEL_CATALOG,
    filter,
    searchQuery,
    isInstalled
  );

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

  const handleClearFilters = () => {
    setFilter("all");
    setSearchQuery("");
  };

  const totalModels = MODEL_CATALOG.length;
  const installedCount = installedModels.size;
  const toolCallingCount = MODEL_CATALOG.filter(
    (m) => m.capabilities.toolCalling
  ).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-xl">Download Models</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {totalModels} models available • {installedCount} installed •{" "}
                  {toolCallingCount} with tool calling
                </p>
              </div>

              <FilterDropdown
                filter={filter}
                setFilter={setFilter}
                totalModels={totalModels}
                installedCount={installedCount}
                toolCallingCount={toolCallingCount}
              />
            </div>

            <SearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          </DialogHeader>

          <ModelGrid
            groupedModels={groupedModels}
            filteredModels={filteredModels}
            isInstalled={isInstalled}
            getProgress={getProgress}
            startDownload={startDownload}
            cancelDownload={cancelDownload}
            handleDeleteClick={handleDeleteClick}
            onClearFilters={handleClearFilters}
          />
        </DialogContent>
      </Dialog>

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
