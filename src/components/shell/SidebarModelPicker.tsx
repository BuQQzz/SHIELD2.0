import { Check, ChevronsUpDown, Library } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isRuntimeAvailable, type ModelOption } from "@/config/models";
import { cn } from "@/lib/utils";

interface SidebarModelPickerProps {
  models: ModelOption[];
  currentModelId?: string;
  isLoading: boolean;
  isModelLoaded: boolean;
  collapsed: boolean;
  onSelect: (model: ModelOption) => void;
  onOpenLibrary: () => void;
}

/** Status light: lit when a model is ready, pulsing while one loads */
function StatusLight({ state }: { state: "ready" | "loading" | "idle" }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      {state === "loading" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/70" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          state === "ready" &&
            "bg-signal shadow-[0_0_8px_1px_var(--color-signal)]",
          state === "loading" && "bg-amber-400",
          state === "idle" && "bg-muted-foreground/40"
        )}
      />
    </span>
  );
}

export function SidebarModelPicker({
  models,
  currentModelId,
  isLoading,
  isModelLoaded,
  collapsed,
  onSelect,
  onOpenLibrary,
}: SidebarModelPickerProps) {
  const current = models.find((m) => m.id === currentModelId);
  const state = isLoading ? "loading" : isModelLoaded ? "ready" : "idle";
  const status = isLoading
    ? "Loading…"
    : isModelLoaded && current
      ? current.size
      : models.length === 0
        ? "No models installed"
        : "No model loaded";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={isLoading}
          title={collapsed ? (current?.displayName ?? "Choose a model") : ""}
          className={cn(
            "group flex w-full items-center rounded-lg border border-border/60 bg-card/40 text-left transition-colors",
            "hover:border-border hover:bg-accent/60 disabled:cursor-progress",
            collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          <StatusLight state={state} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {current?.displayName ?? "Choose a model"}
                </span>
                <span className="block truncate font-instrument text-[11px] text-muted-foreground">
                  {status}
                </span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={collapsed ? "right" : "bottom"}
        align="start"
        className="w-64"
      >
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Installed models
        </DropdownMenuLabel>
        {models.length === 0 && (
          <p className="px-2 pb-2 text-xs text-muted-foreground">
            Nothing installed yet. Get one from the library.
          </p>
        )}
        {models.map((model) => {
          const runnable = isRuntimeAvailable(model);
          return (
            <DropdownMenuItem
              key={model.id}
              disabled={!runnable}
              onClick={() => onSelect(model)}
              className="flex items-center gap-2 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {model.displayName}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {runnable ? (
                    <span className="font-instrument">{model.size}</span>
                  ) : (
                    "Needs PrismML's runtime - coming soon"
                  )}
                </span>
              </span>
              {model.id === currentModelId && (
                <Check className="h-4 w-4 shrink-0 text-signal" />
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onOpenLibrary} className="gap-2 py-2">
          <Library className="h-4 w-4" />
          Open Model Library
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
