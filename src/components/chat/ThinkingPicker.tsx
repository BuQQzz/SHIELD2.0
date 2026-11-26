/**
 * How long the model thinks, beside the model picker: Default, Instant,
 * Low to Max (config/thinking.ts). Kept per model. Default leaves the model
 * and SHIELD's tuning for it as they are.
 */

import { Brain, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isThinkingLevel,
  THINKING_LABELS,
  THINKING_LEVELS,
  THINKING_NOTES,
} from "@/config/thinking";
import { levelFor, useThinkingStore } from "@/stores/thinking-store";
import { cn } from "@/lib/utils";

export function ThinkingPicker({ modelId }: { modelId?: string }) {
  const level = useThinkingStore((state) => levelFor(state.levels, modelId));
  const setLevel = useThinkingStore((state) => state.set);
  if (!modelId) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={`Thinking: ${THINKING_LABELS[level]}. ${THINKING_NOTES[level]}.`}
          aria-label={`Thinking: ${THINKING_LABELS[level]}`}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            level !== "default" && "text-foreground/80"
          )}
        >
          <Brain className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {level !== "default" && <span>{THINKING_LABELS[level]}</span>}
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Thinking for this model
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={level}
          onValueChange={(value) => {
            if (isThinkingLevel(value)) setLevel(modelId, value);
          }}
        >
          {THINKING_LEVELS.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              className="flex-col items-start gap-0 py-1.5"
            >
              <span className="text-sm">{THINKING_LABELS[option]}</span>
              <span className="text-[11px] text-muted-foreground">
                {THINKING_NOTES[option]}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
