/**
 * Model Library
 *
 * Full-page view of SHIELD's curated models: a few families, each with
 * variants for different jobs and GPUs. Shows what fits this machine,
 * downloads, loads and removes models.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import {
  MODEL_CATALOG,
  MODEL_FAMILIES,
  getRecommendedVariant,
  type ModelMetadata,
  type ModelOption,
} from "@/config/models";
import { useModelDownload } from "@/hooks/useModelDownload";
import { useHardwareInfo } from "@/hooks/useHardwareInfo";
import { DeleteModelDialog } from "@/components/models/DeleteModelDialog";
import { cn } from "@/lib/utils";
import { LibraryModelRow } from "./LibraryModelRow";

type Filter = "all" | "agent" | "chat" | "small" | "installed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "agent", label: "Agent & coding" },
  { key: "chat", label: "Chat" },
  { key: "small", label: "Small & fast" },
  { key: "installed", label: "Installed" },
];

interface ModelLibraryPageProps {
  currentModelId?: string;
  isModelLoaded: boolean;
  isModelLoading: boolean;
  onLoadModel: (model: ModelOption) => void;
  /** Installed files changed (download finished, model removed) */
  onInstalledChange: () => void;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">
          {label}
        </div>
        <div className="font-instrument text-sm">{value}</div>
      </div>
    </div>
  );
}

export function ModelLibraryPage({
  currentModelId,
  isModelLoaded,
  isModelLoading,
  onLoadModel,
  onInstalledChange,
}: ModelLibraryPageProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [modelToDelete, setModelToDelete] = useState<ModelMetadata | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const hardware = useHardwareInfo();

  const {
    installedModels,
    startDownload,
    cancelDownload,
    deleteModel,
    isInstalled,
    getProgress,
  } = useModelDownload({
    onComplete: () => onInstalledChange(),
    onError: (modelId, error) =>
      console.error(`[ModelLibrary] Download failed for ${modelId}:`, error),
  });

  const families = useMemo(() => {
    const matches = (model: ModelMetadata) => {
      switch (filter) {
        case "agent":
          return (
            model.roles.includes("agent") || model.roles.includes("coding")
          );
        case "chat":
          return model.roles.includes("chat");
        case "small":
          return model.roles.includes("small");
        case "installed":
          return isInstalled(model.id);
        default:
          return true;
      }
    };
    return MODEL_FAMILIES.map((family) => ({
      family,
      recommended: getRecommendedVariant(family, hardware),
      variants: family.variants.filter(matches),
    })).filter((entry) => entry.variants.length > 0);
  }, [filter, hardware, isInstalled]);

  const handleDeleteConfirm = async () => {
    if (!modelToDelete) return;
    setIsDeleting(true);
    try {
      const result = await deleteModel(modelToDelete);
      if (result.success) {
        setModelToDelete(null);
        onInstalledChange();
      } else {
        console.error(`[ModelLibrary] Delete failed: ${result.error}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const gb = (value: number | null | undefined) =>
    value == null ? "—" : `${Math.round(value)} GB`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-8 pb-16 pt-10">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h1 className="text-2xl font-semibold tracking-tight">
            Model Library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A few current models, matched to this PC. Everything runs locally.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Stat icon={Cpu} label="GPU memory" value={gb(hardware?.vramGB)} />
            <Stat
              icon={MemoryStick}
              label="System RAM"
              value={gb(hardware?.ramGB)}
            />
            <Stat
              icon={HardDrive}
              label="Installed"
              value={`${installedModels.size} of ${MODEL_CATALOG.length}`}
            />
          </div>

          {/* Filters */}
          <div className="mt-8 flex flex-wrap gap-1 border-b border-border/60 pb-px">
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  "relative px-3 pb-2.5 pt-1 text-sm transition-colors",
                  filter === key
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
                {filter === key && (
                  <motion.span
                    layoutId="library-filter"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal"
                  />
                )}
              </button>
            ))}
          </div>
        </motion.header>

        {/* Families */}
        <div className="mt-8 space-y-10">
          {families.map(({ family, recommended, variants }, index) => (
            <motion.section
              key={family.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 + index * 0.06 }}
            >
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">
                  {family.name}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {family.provider}
                </span>
                <span className="hidden truncate text-xs text-muted-foreground/70 md:block">
                  — {family.description}
                </span>
              </div>
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60 bg-card/30">
                {variants.map((model) => (
                  <LibraryModelRow
                    key={model.id}
                    model={model}
                    hardware={hardware}
                    isRecommended={recommended?.id === model.id}
                    isInstalled={isInstalled(model.id)}
                    isCurrent={model.id === currentModelId}
                    isLoaded={model.id === currentModelId && isModelLoaded}
                    isModelLoading={isModelLoading}
                    progress={getProgress(model.id)}
                    onDownload={() => startDownload(model)}
                    onCancel={() => cancelDownload(model.id)}
                    onLoad={() => onLoadModel(model)}
                    onDelete={() => setModelToDelete(model)}
                  />
                ))}
              </div>
            </motion.section>
          ))}

          {families.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nothing here yet.{" "}
              <button
                onClick={() => setFilter("all")}
                className="text-signal hover:underline"
              >
                Show all models
              </button>
            </p>
          )}
        </div>
      </div>

      <DeleteModelDialog
        open={!!modelToDelete}
        model={modelToDelete}
        onOpenChange={(open) => !open && setModelToDelete(null)}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </div>
  );
}
