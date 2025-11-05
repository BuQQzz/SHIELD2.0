/**
 * Model Card Component
 *
 * Displays model information with capability badges,
 * hardware requirements, and download/install status
 */

import { Download, Check, HardDrive, Cpu, Database, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityBadgeGroup } from "./CapabilityBadge";
import { DownloadProgressBar } from "./DownloadProgressBar";
import type { ModelMetadata } from "@/config/models";
import type { DownloadProgress } from "@/types/electron";
import { cn } from "@/lib/utils";

interface ModelCardProps {
  model: ModelMetadata;
  isInstalled: boolean;
  downloadProgress?: DownloadProgress;
  onDownload?: (model: ModelMetadata) => void;
  onCancel?: (modelId: string) => void;
  onDelete?: (model: ModelMetadata) => void;
  compact?: boolean;
}

export function ModelCard({
  model,
  isInstalled,
  downloadProgress,
  onDownload,
  onCancel,
  onDelete,
  compact = false,
}: ModelCardProps) {
  const isDownloading = downloadProgress?.status === "downloading";

  const handleAction = () => {
    if (isDownloading && onCancel) {
      onCancel(model.id);
    } else if (!isInstalled && !isDownloading && onDownload) {
      onDownload(model);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-all",
        "hover:shadow-md",
        compact ? "space-y-2" : "space-y-3"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base truncate">
              {model.displayName}
            </h3>
            {model.capabilities.toolCalling && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">
                ⚡ Premium
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {model.provider} • {model.releaseDate || "2024"}
          </p>
        </div>

        {/* Download/Status Button */}
        {isInstalled ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled
              className="shrink-0 gap-2"
            >
              <Check className="h-4 w-4 text-green-600" />
              Installed
            </Button>
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(model)}
                className="shrink-0"
                title="Delete model"
              >
                <Database className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : isDownloading ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleAction}
            className="shrink-0 gap-2"
          >
            Cancel
          </Button>
        ) : (
          <Button size="sm" onClick={handleAction} className="shrink-0 gap-2">
            <Download className="h-4 w-4" />
            Download
          </Button>
        )}
      </div>

      {/* Description */}
      {!compact && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {model.description}
        </p>
      )}

      {/* Capability Badges */}
      <CapabilityBadgeGroup
        capabilities={model.capabilities}
        size="sm"
        showLabels={false}
        maxDisplay={compact ? 4 : undefined}
      />

      {/* Hardware & Size Info */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5" title="File Size">
          <HardDrive className="h-3.5 w-3.5" />
          <span>{model.size}</span>
        </div>
        <div className="flex items-center gap-1.5" title="Minimum VRAM">
          <Cpu className="h-3.5 w-3.5" />
          <span>{model.hardware.minVRAM}GB+ VRAM</span>
        </div>
        <div className="flex items-center gap-1.5" title="Context Window">
          <Database className="h-3.5 w-3.5" />
          <span>{(model.contextSize / 1024).toFixed(0)}K context</span>
        </div>
      </div>

      {/* Download Progress Bar */}
      {isDownloading && downloadProgress && (
        <DownloadProgressBar
          progress={downloadProgress}
          size="md"
          showDetails
        />
      )}
    </div>
  );
}
