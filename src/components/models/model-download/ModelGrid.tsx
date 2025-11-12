/**
 * Model Grid - Displays categorized model cards
 */

import { Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ModelCard } from "../ModelCard";
import type { ModelMetadata } from "@/config/models";
import type { DownloadProgress } from "@/types/electron";

interface ModelGridProps {
  groupedModels: {
    premium: ModelMetadata[];
    standard: ModelMetadata[];
    efficient: ModelMetadata[];
  };
  filteredModels: ModelMetadata[];
  isInstalled: (modelId: string) => boolean;
  getProgress: (modelId: string) => DownloadProgress | undefined;
  startDownload: (model: ModelMetadata) => Promise<void>;
  cancelDownload: (modelId: string) => Promise<void>;
  handleDeleteClick: (model: ModelMetadata) => void;
  onClearFilters: () => void;
}

export function ModelGrid({
  groupedModels,
  filteredModels,
  isInstalled,
  getProgress,
  startDownload,
  cancelDownload,
  handleDeleteClick,
  onClearFilters,
}: ModelGridProps) {
  return (
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
              onClick={onClearFilters}
              className="mt-2"
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
