import { useCallback, useEffect, useState } from "react";
import { Cpu, Download, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  RuntimeProgress,
  RuntimeRelease,
  RuntimeStatus,
  RuntimeVariant,
} from "@/types/runtime";

const VARIANT_LABELS: Record<RuntimeVariant, string> = {
  "win-cuda-13.3": "NVIDIA, CUDA 13",
  "win-cuda-12.4": "NVIDIA, CUDA 12 (older drivers)",
  "win-vulkan": "Vulkan (AMD, Intel)",
  "win-cpu": "CPU only",
  "linux-cuda-13.3": "NVIDIA, CUDA 13",
  "linux-cuda-12.4": "NVIDIA, CUDA 12 (older drivers)",
  "linux-vulkan": "Vulkan (AMD, Intel)",
  "linux-cpu": "CPU only",
  "macos-arm64": "Apple silicon (Metal)",
  "macos-x64": "Intel Mac",
};

const SOURCE_LABELS: Record<RuntimeStatus["source"], string> = {
  env: "from SHIELD_LLAMA_SERVER",
  managed: "installed by SHIELD",
  "bonsai-demo": "from the Bonsai demo folder",
  none: "not found",
};

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(2)} GB`;
/** "prism-b12128-d7b2896" → "b12128" */
const build = (tag: string) => tag.match(/b\d+/)?.[0] ?? tag;

/**
 * Settings › Runtime: the llama-server that runs local models. SHIELD talks
 * to GitHub only when the user checks for a build here.
 */
export function RuntimeSettings() {
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [variant, setVariant] = useState<RuntimeVariant | null>(null);
  const [release, setRelease] = useState<RuntimeRelease | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<RuntimeProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.electronAPI.runtime.status();
    if (!result.success || !result.status) {
      setError(result.error ?? "Could not read the runtime");
      return;
    }
    setStatus(result.status);
    setVariant(
      (current) =>
        current ??
        result.status!.active?.variant ??
        result.status!.recommendedVariant
    );
  }, []);

  useEffect(() => {
    void refresh();
    return window.electronAPI.runtime.onProgress(setProgress);
  }, [refresh]);

  const check = async () => {
    if (!variant) return;
    setChecking(true);
    setError(null);
    const result = await window.electronAPI.runtime.latest(variant);
    setChecking(false);
    if (!result.success) setError(result.error ?? "Check failed");
    else if (!result.release) setError("No release has this build");
    else setRelease(result.release);
  };

  const install = async () => {
    if (!variant) return;
    setError(null);
    setProgress({ phase: "downloading", received: 0, total: 0 });
    const result = await window.electronAPI.runtime.install(variant);
    setProgress(null);
    if (!result.success) setError(result.error ?? "Install failed");
    await refresh();
  };

  const rollback = async () => {
    setError(null);
    const result = await window.electronAPI.runtime.rollback();
    if (!result.success) setError(result.error ?? "Rollback failed");
    await refresh();
  };

  if (!status) return null;
  const active = status.active;
  const upToDate =
    !!release &&
    active?.tag === release.tag &&
    active.variant === release.variant;
  const variants = (Object.keys(VARIANT_LABELS) as RuntimeVariant[]).filter(
    (v) =>
      status.recommendedVariant &&
      v.split("-")[0] === status.recommendedVariant.split("-")[0]
  );
  const busy = progress !== null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
        <Cpu className="mt-0.5 h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">
            llama-server{" "}
            {status.source === "none"
              ? "is not installed"
              : SOURCE_LABELS[status.source]}
          </p>
          {status.binary && (
            <p
              className="truncate font-mono text-xs text-muted-foreground"
              title={status.binary}
            >
              {status.binary}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {active
              ? `Installed: ${build(active.tag)}, ${VARIANT_LABELS[active.variant]}. `
              : ""}
            SHIELD was last tested with {build(status.testedTag)}. Builds come
            from PrismML's llama.cpp on GitHub, checked against their published
            sha256; a new one is used from the next model load.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {variants.length > 1 && (
          <select
            value={variant ?? ""}
            onChange={(e) => {
              setVariant(e.target.value as RuntimeVariant);
              setRelease(null);
            }}
            disabled={busy}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {variants.map((v) => (
              <option key={v} value={v}>
                {VARIANT_LABELS[v]}
                {v === status.recommendedVariant ? " (recommended)" : ""}
              </option>
            ))}
          </select>
        )}
        {!release ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!variant || checking || busy}
            onClick={() => void check()}
          >
            {checking ? "Checking…" : "Check for the latest build"}
          </Button>
        ) : upToDate ? (
          <span className="text-xs text-muted-foreground">
            {build(release.tag)} is the latest build.
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void install()}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            {active ? "Update" : "Install"} {build(release.tag)} (
            {gb(release.downloadBytes)})
          </Button>
        )}
        {status.previous && !busy && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void rollback()}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Back to {build(status.previous.tag)}
          </Button>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {progress.phase === "downloading"
                ? `Downloading ${gb(progress.received)} of ${gb(progress.total || release?.downloadBytes || 0)}`
                : progress.phase === "unpacking"
                  ? "Unpacking…"
                  : progress.phase === "testing"
                    ? "Checking that it starts…"
                    : "Done"}
            </span>
            {progress.phase === "downloading" && (
              <button
                type="button"
                onClick={() => void window.electronAPI.runtime.cancel()}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <X className="h-3 w-3" /> Cancel
              </button>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{
                width: `${progress.total ? Math.round((progress.received / progress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
