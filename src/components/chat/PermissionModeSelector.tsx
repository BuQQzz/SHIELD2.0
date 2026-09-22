/**
 * Permission Mode Selector
 *
 * Sets how much autonomy tool calls get. This is a per-turn decision rather
 * than a buried preference, so it lives next to the composer where the user
 * can see the current mode while typing.
 */

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronUp, ShieldCheck } from "lucide-react";
import { useSettingsStore } from "@/store/settingsStore";
import type { PermissionMode } from "@/types/settings";

interface ModeOption {
  value: PermissionMode;
  label: string;
  description: string;
}

const MODES: ModeOption[] = [
  {
    value: "ask",
    label: "Ask",
    description: "Approve every tool call",
  },
  {
    value: "auto",
    label: "Auto",
    description: "Run reads automatically, ask before changes",
  },
  {
    value: "plan",
    label: "Plan",
    description: "Describe the steps, run nothing",
  },
  {
    value: "readonly",
    label: "Read only",
    description: "Hide tools that can change files",
  },
];

export function PermissionModeSelector() {
  const { settings, updateSettings } = useSettingsStore();
  const current = settings.mcp?.mode ?? "ask";
  const active = MODES.find((m) => m.value === current) ?? MODES[0]!;

  const handleSelect = async (mode: PermissionMode) => {
    if (mode === current) return;
    await updateSettings({ mcp: { ...settings.mcp, mode } });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={`Permissions: ${active.description}`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {active.label}
          <ChevronUp className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Tool permissions
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODES.map((mode) => (
          <DropdownMenuItem
            key={mode.value}
            onClick={() => handleSelect(mode.value)}
            className="flex cursor-pointer items-start gap-2 py-2"
          >
            <Check
              className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                mode.value === current ? "text-primary" : "opacity-0"
              }`}
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-none">{mode.label}</p>
              <p className="text-xs text-muted-foreground">
                {mode.description}
              </p>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
