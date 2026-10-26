import { useState } from "react";
import { MemoryStick } from "lucide-react";
import { useContextPlan } from "@/hooks/useContextPlan";
import { useSettingsStore } from "@/store/settingsStore";
import { formatGB } from "@/lib/format";
import { describeRamUse } from "./ramUse";

interface RamNoticeProps {
  modelId: string;
  /** Called after the context changes, e.g. to reload the loaded model */
  onContextChange?: () => void;
  disabled?: boolean;
}

/** 8192 -> "8K" */
function formatContext(tokens: number): string {
  return `${Math.round(tokens / 1024)}K`;
}

/**
 * "Runs partly from system RAM · ~12 GB" for models that do not fit on the
 * GPU. The explanation opens once per model: heavy, sustained memory load
 * is normally fine, but it is where an unstable memory setup shows. The
 * model exposes such a setup; it does not create one.
 */
export function RamNotice({
  modelId,
  onContextChange,
  disabled,
}: RamNoticeProps) {
  const { plan } = useContextPlan(modelId);
  const { settings, updateSettings } = useSettingsStore();
  const chosen = settings.model.contextByModel?.[modelId];
  const seen = settings.model.ramNoticeSeen?.includes(modelId) ?? false;
  const [open, setOpen] = useState<boolean | null>(null);

  const use = plan ? describeRamUse(plan, chosen) : null;
  if (!use) return null;
  const expanded = open ?? !seen;

  const dismiss = async () => {
    setOpen(false);
    if (seen) return;
    await updateSettings({
      model: {
        ...settings.model,
        ramNoticeSeen: [...(settings.model.ramNoticeSeen ?? []), modelId],
      },
    });
  };

  const chooseLighter = async (contextSize: number) => {
    await updateSettings({
      model: {
        ...settings.model,
        contextByModel: {
          ...settings.model.contextByModel,
          [modelId]: contextSize,
        },
      },
    });
    onContextChange?.();
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-amber-500 transition-colors hover:text-amber-400"
        aria-expanded={expanded}
      >
        <MemoryStick className="h-3.5 w-3.5" />
        Runs partly from system RAM ·{" "}
        <span className="font-instrument">~{formatGB(use.ramBytes)}</span>
      </button>

      {expanded && (
        <div className="mt-2 max-w-xl rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <p>
            At {formatContext(use.contextSize)} context this model keeps about{" "}
            {formatGB(use.ramBytes)} in system RAM while it runs: heavy,
            sustained memory load. That is normally fine. If a PC&apos;s memory
            is unstable, for example overclocked RAM, long runs of a model like
            this are where it tends to show.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {use.lighter && (
              <button
                onClick={() => chooseLighter(use.lighter!.contextSize)}
                disabled={disabled}
                className="rounded-md border border-border/80 px-2 py-1 text-[11px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                Use {formatContext(use.lighter.contextSize)} context · ~
                {formatGB(use.lighter.ramBytes)}
              </button>
            )}
            <button
              onClick={dismiss}
              className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
