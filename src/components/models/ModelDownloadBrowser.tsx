/**
 * Model Download Browser Component
 *
 * Displays the categorized grid of models with animations
 * Handles the visual presentation of filtered model groups
 */

import { motion, AnimatePresence } from "framer-motion";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelCard } from "./ModelCard";
import type { ModelMetadata } from "@/config/models";
import type { DownloadProgress } from "@/types/electron";

interface ModelDownloadBrowserProps {
  premiumModels: ModelMetadata[];
  standardModels: ModelMetadata[];
  efficientModels: ModelMetadata[];
  hasResults: boolean;
  isInstalled: (modelId: string) => boolean;
  getProgress: (modelId: string) => DownloadProgress | undefined;
  onDownload: (model: ModelMetadata) => void;
  onCancel: (modelId: string) => void;
  onDeleteClick: (model: ModelMetadata) => void;
  onClearFilters: () => void;
}

export function ModelDownloadBrowser({
  premiumModels,
  standardModels,
  efficientModels,
  hasResults,
  isInstalled,
  getProgress,
  onDownload,
  onCancel,
  onDeleteClick,
  onClearFilters,
}: ModelDownloadBrowserProps) {
  if (!hasResults) {
    return (
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
    );
  }

  return (
    <div className="space-y-6">
      {/* Premium Models (Tool Calling) */}
      {premiumModels.length > 0 && (
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
              {premiumModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isInstalled={isInstalled(model.id)}
                  downloadProgress={getProgress(model.id)}
                  onDownload={onDownload}
                  onCancel={onCancel}
                  onDeleteClick={onDeleteClick}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Standard Models (7B-14B) */}
      {standardModels.length > 0 && (
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
              {standardModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isInstalled={isInstalled(model.id)}
                  downloadProgress={getProgress(model.id)}
                  onDownload={onDownload}
                  onCancel={onCancel}
                  onDeleteClick={onDeleteClick}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Efficient Models (<5GB) */}
      {efficientModels.length > 0 && (
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
              {efficientModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  isInstalled={isInstalled(model.id)}
                  downloadProgress={getProgress(model.id)}
                  onDownload={onDownload}
                  onCancel={onCancel}
                  onDeleteClick={onDeleteClick}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
