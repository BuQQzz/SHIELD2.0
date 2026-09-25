import { Check, Download, Loader2, Trash2, X } from "lucide-react";
import {
  formatModelSize,
  getModelFit,
  isRuntimeAvailable,
  pickModelFile,
  type HardwareInfo,
  type ModelMetadata,
  type ModelRole,
} from "@/config/models";
import type { DownloadProgress } from "@/types/electron";
import { cn } from "@/lib/utils";
import { ContextPicker } from "./ContextPicker";
import { RamNotice } from "./RamNotice";

const ROLE_LABELS: Record<ModelRole, string> = {
  agent: "Agent",
  coding: "Coding",
  chat: "Chat",
  small: "Small",
  "long-context": "Long context",
  vision: "Vision",
};

interface LibraryModelRowProps {
  model: ModelMetadata;
  hardware: HardwareInfo | null;
  isRecommended: boolean;
  isInstalled: boolean;
  /** The model the app has selected */
  isCurrent: boolean;
  /** Selected and loaded */
  isLoaded: boolean;
  isModelLoading: boolean;
  progress?: DownloadProgress;
  onDownload: () => void;
  onCancel: () => void;
  onLoad: () => void;
  onDelete: () => void;
}

/**
 * How much of the GPU the model file takes. Past 100% the rest runs from
 * system RAM - fine for mixture-of-experts models, slower for dense ones.
 */
function GpuMeter({
  sizeBytes,
  vramGB,
}: {
  sizeBytes: number;
  vramGB: number | null;
}) {
  if (vramGB == null) {
    return (
      <span className="font-instrument text-xs text-muted-foreground">
        {formatModelSize(sizeBytes)}
      </span>
    );
  }
  const ratio = sizeBytes / (vramGB * 2 ** 30);
  const tone =
    ratio <= 0.8
      ? "fits"
      : ratio <= 1
        ? "tight"
        : ratio <= 1.8
          ? "split"
          : "over";
  const label = {
    fits: "Fits on GPU",
    tight: "Just fits",
    split: "Part in RAM",
    over: "Mostly in RAM",
  }[tone];

  return (
    <div className="w-36" title={`${Math.round(ratio * 100)}% of GPU memory`}>
      <div className="flex items-baseline justify-between">
        <span className="font-instrument text-xs">
          {formatModelSize(sizeBytes)}
        </span>
        <span
          className={cn(
            "text-[10px]",
            tone === "fits" && "text-signal",
            tone === "tight" && "text-muted-foreground",
            (tone === "split" || tone === "over") && "text-amber-500"
          )}
        >
          {label}
        </span>
      </div>
      <div className="relative mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            tone === "fits" && "bg-signal",
            tone === "tight" && "bg-muted-foreground",
            (tone === "split" || tone === "over") && "bg-amber-500"
          )}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
    </div>
  );
}

function formatEta(seconds: number): string {
  if (seconds <= 0) return "";
  if (seconds < 60) return `${seconds}s left`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60
    ? `${minutes}m left`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}

export function LibraryModelRow({
  model,
  hardware,
  isRecommended,
  isInstalled,
  isCurrent,
  isLoaded,
  isModelLoading,
  progress,
  onDownload,
  onCancel,
  onLoad,
  onDelete,
}: LibraryModelRowProps) {
  const runnable = isRuntimeAvailable(model);
  const fit = getModelFit(model, hardware);
  const file = pickModelFile(model.files, hardware?.vramGB ?? null);
  const downloading = progress?.status === "downloading";
  const installed = isInstalled || progress?.status === "completed";
  const loadingThis = isCurrent && isModelLoading;

  let action: React.ReactNode;
  if (downloading) {
    action = (
      <button
        onClick={onCancel}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
        Cancel
      </button>
    );
  } else if (!runnable) {
    action = (
      <span
        className="flex h-8 items-center rounded-lg border border-dashed border-border/80 px-3 text-xs text-muted-foreground"
        title="Needs PrismML's runtime, which SHIELD does not run yet"
      >
        {installed ? "Installed · runtime soon" : "Coming soon"}
      </span>
    );
  } else if (installed) {
    action = (
      <div className="flex items-center gap-1">
        {isLoaded ? (
          <span className="flex h-8 items-center gap-1.5 rounded-lg bg-signal-soft px-3 text-xs font-medium text-signal">
            <Check className="h-3.5 w-3.5" />
            In use
          </span>
        ) : (
          <button
            onClick={onLoad}
            disabled={isModelLoading}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loadingThis && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {loadingThis ? "Loading" : "Load"}
          </button>
        )}
        <button
          onClick={onDelete}
          disabled={isCurrent}
          title={
            isCurrent
              ? "Switch to another model before removing this one"
              : "Remove (moves files to the Recycle Bin)"
          }
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  } else {
    action = (
      <button
        onClick={onDownload}
        disabled={fit === "too-large"}
        title={
          fit === "too-large"
            ? `Needs ${model.hardware.minVRAM} GB of GPU memory and ${model.hardware.minRAM} GB of RAM`
            : undefined
        }
        className="flex h-8 items-center gap-1.5 rounded-lg border border-border/80 px-3 text-xs font-medium transition-colors hover:border-signal/60 hover:bg-signal-soft hover:text-signal disabled:pointer-events-none disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </button>
    );
  }

  return (
    <div className="group px-5 py-4 transition-colors hover:bg-accent/20">
      <div className="flex items-center gap-6">
        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{model.displayName}</h3>
            {isRecommended && (
              <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-signal">
                Recommended
              </span>
            )}
            {fit === "too-large" && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                Too large for this PC
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {model.description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
            <span>{model.roles.map((r) => ROLE_LABELS[r]).join(" · ")}</span>
            {installed && runnable && (
              <ContextPicker
                modelId={model.id}
                disabled={isModelLoading}
                // The loaded model takes a new window size only on reload
                onChange={isLoaded ? onLoad : undefined}
              />
            )}
            {model.releaseDate && (
              <span className="font-instrument">{model.releaseDate}</span>
            )}
          </div>
          {installed && runnable && (
            <RamNotice
              modelId={model.id}
              disabled={isModelLoading}
              onContextChange={isLoaded ? onLoad : undefined}
            />
          )}
        </div>

        {/* Fit */}
        <div className="hidden shrink-0 sm:block">
          {file && (
            <GpuMeter
              sizeBytes={file.sizeBytes}
              vramGB={hardware?.vramGB ?? null}
            />
          )}
        </div>

        {/* Action */}
        <div className="flex w-36 shrink-0 justify-end">{action}</div>
      </div>

      {downloading && progress && (
        <div className="mt-3">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-instrument text-[11px] text-muted-foreground">
            <span>
              {progress.progress.toFixed(0)}% ·{" "}
              {formatModelSize(progress.downloadedBytes)} of{" "}
              {formatModelSize(progress.totalBytes)}
            </span>
            <span>
              {progress.speed > 0 &&
                `${(progress.speed / 1e6).toFixed(0)} MB/s · `}
              {formatEta(progress.eta)}
            </span>
          </div>
        </div>
      )}
      {progress?.status === "error" && (
        <p className="mt-2 text-xs text-destructive">
          Download failed: {progress.error}
        </p>
      )}
    </div>
  );
}
