import { Check, ChevronDown, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/store/settingsStore";
import { useContextPlan } from "@/hooks/useContextPlan";
import { formatGB } from "@/lib/format";
import type { MemoryNeed } from "@/types/electron";
import { cn } from "@/lib/utils";

interface ContextPickerProps {
  modelId: string;
  /** Called after the choice changes, e.g. to reload the loaded model */
  onChange?: () => void;
  disabled?: boolean;
}

/** 8192 -> "8K", 262144 -> "256K" */
function formatTokens(tokens: number): string {
  return `${Math.round(tokens / 1024)}K`;
}

/**
 * Context window for one model: the recommended size by default, or a
 * fixed one. Each size says how much of the model stays on the GPU, since
 * that is the price of a bigger window.
 */
export function ContextPicker({
  modelId,
  onChange,
  disabled,
}: ContextPickerProps) {
  const { plan, failed } = useContextPlan(modelId);
  const { settings, updateSettings } = useSettingsStore();
  const chosen = settings.model.contextByModel?.[modelId];

  if (failed) return null;
  if (!plan) {
    return (
      <span className="flex items-center gap-1 font-instrument text-[11px] text-muted-foreground/70">
        <Loader2 className="h-3 w-3 animate-spin" />
        ctx
      </span>
    );
  }

  const choose = async (size: number | undefined) => {
    if (size === chosen) return;
    const next = { ...settings.model.contextByModel };
    if (size === undefined) delete next[modelId];
    else next[modelId] = size;
    await updateSettings({
      model: { ...settings.model, contextByModel: next },
    });
    onChange?.();
  };

  // With llama-server, attention stays on the GPU and experts move to RAM
  // to fit, so a size is not a layer trade-off
  const experts = plan.placement === "experts";
  const onGpu = (gpuLayers: number, memory?: MemoryNeed) =>
    experts
      ? memory
        ? `~${formatGB(memory.ramBytes)} in RAM`
        : ""
      : gpuLayers >= plan.totalLayers
        ? "all on GPU"
        : `${gpuLayers}/${plan.totalLayers} layers on GPU`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled}
          className="flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 font-instrument text-[11px] text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
          title="Context window: how much of the conversation the model sees"
        >
          {formatTokens(chosen ?? plan.recommended)} ctx
          {chosen === undefined && (
            <span className="text-signal/80">· auto</span>
          )}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Context window · trained for{" "}
          <span className="font-instrument">
            {formatTokens(plan.trainContextSize)}
          </span>
        </DropdownMenuLabel>
        {experts && (
          <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
            Experts move to system RAM to make room, so a bigger window mostly
            costs prompt-reading speed.
          </p>
        )}
        <DropdownMenuItem onClick={() => choose(undefined)} className="gap-2">
          <span className="flex-1">
            Recommended{" "}
            <span className="font-instrument text-muted-foreground">
              {formatTokens(plan.recommended)}
            </span>
          </span>
          {chosen === undefined && <Check className="h-4 w-4 text-signal" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {plan.options.map(({ contextSize, gpuLayers, memory }) => (
          <DropdownMenuItem
            key={contextSize}
            onClick={() => choose(contextSize)}
            className="gap-2"
          >
            <span className="w-11 font-instrument">
              {formatTokens(contextSize)}
            </span>
            <span
              className={cn(
                "flex-1 text-xs",
                gpuLayers >= plan.totalLayers && !experts
                  ? "text-muted-foreground"
                  : "text-amber-500"
              )}
            >
              {onGpu(gpuLayers, memory)}
            </span>
            {chosen === contextSize && (
              <Check className="h-4 w-4 text-signal" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
