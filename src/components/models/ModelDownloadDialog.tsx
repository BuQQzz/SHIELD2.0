/**
 * Model Download Dialog
 *
 * Browse, filter, and download AI models from trusted sources
 * Shows model capabilities, hardware requirements, and download progress
 */

import { useState, useMemo } from "react";
import { Filter, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ModelCard } from "./ModelCard";
import { DeleteModelDialog } from "./DeleteModelDialog";
import { MODEL_CATALOG, type ModelMetadata } from "@/config/models";
import { useModelDownload } from "@/hooks/useModelDownload";
import { cn } from "@/lib/utils";

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

              {/* Filter Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Filter className="h-4 w-4" />
                    {filter === "all" && "All Models"}
                    {filter === "tool-calling" && "Tool Calling"}
                    {filter === "coding" && "Code Generation"}
                    {filter === "efficient" && "Efficient (<5GB)"}
                    {filter === "installed" && "Installed"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Filter by Category</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFilter("all")}>
                    All Models ({totalModels})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("tool-calling")}>
                    ⚡ Tool Calling ({toolCallingCount})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("coding")}>
                    💻 Code Generation
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFilter("efficient")}>
                    🚀 Efficient (&lt;5GB)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFilter("installed")}>
                    ✅ Installed ({installedCount})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Search Bar */}
            <div className="mt-4">
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full px-3 py-2 rounded-md border bg-background",
                  "text-sm placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring"
                )}
              />
            </div>
          </DialogHeader>

          {/* Model Grid */}
          <div className="flex-1 overflow-y-auto mt-4 -mx-6 px-6">
            <div className="space-y-6">
              {/* Premium Models (Tool Calling) */}
              {groupedModels.premium.length > 0 && (
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        ⚡ Premium - Tool Calling
                      </h3>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedModels.premium.map((model) => (
                        <ModelCard
                          key={model.id}
                          model={model}
                          isInstalled={isInstalled(model.id)}
                          downloadProgress={getProgress(model.id)}
                          onDownload={startDownload}
                          onCancel={cancelDownload}
                          onDeleteClick={handleDeleteClick}
                        />
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Standard Models (7B-14B) */}
              {groupedModels.standard.length > 0 && (
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        🎯 High Performance
                      </h3>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedModels.standard.map((model) => (
                        <ModelCard
                          key={model.id}
                          model={model}
                          isInstalled={isInstalled(model.id)}
                          downloadProgress={getProgress(model.id)}
                          onDownload={startDownload}
                          onCancel={cancelDownload}
                          onDeleteClick={handleDeleteClick}
                        />
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}

              {/* Efficient Models (<5GB) */}
              {groupedModels.efficient.length > 0 && (
                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        🚀 Efficient & Fast
                      </h3>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupedModels.efficient.map((model) => (
                        <ModelCard
                          key={model.id}
                          model={model}
                          isInstalled={isInstalled(model.id)}
                          downloadProgress={getProgress(model.id)}
                          onDownload={startDownload}
                          onCancel={cancelDownload}
                          onDeleteClick={handleDeleteClick}
                        />
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}

              {/* No Results */}
              {filteredModels.length === 0 && (
                <div className="text-center py-12">
                  <Download className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    No models found matching your criteria
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setFilter("all");
                      setSearchQuery("");
                    }}
                    className="mt-2"
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
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
