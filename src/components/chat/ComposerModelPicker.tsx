/**
 * A model picker in the composer, next to the Team toggle, so the model can
 * be changed without leaving the chat. It shows the same list as the sidebar
 * picker (ModelPickerMenu), including the per-model zero-retention opt-out on
 * hosted models that have no such route.
 */

import { ChevronDown, Cloud, Cpu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelPickerMenu } from "@/components/shell/ModelPickerMenu";
import { type ModelOption } from "@/config/models";
import { useCloudStore } from "@/stores/cloud-store";

interface ComposerModelPickerProps {
  models: ModelOption[];
  currentModelId?: string;
  isLoading?: boolean;
  onSelect: (model: ModelOption) => void;
  onOpenLibrary: () => void;
  onOpenSettings?: () => void;
}

export function ComposerModelPicker({
  models,
  currentModelId,
  isLoading,
  onSelect,
  onOpenLibrary,
  onOpenSettings,
}: ComposerModelPickerProps) {
  const loadProviders = useCloudStore((state) => state.loadProviders);
  const fetchModels = useCloudStore((state) => state.fetchModels);
  const current = models.find((m) => m.id === currentModelId);
  const hosted = current?.runtime === "remote";

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // The provider's models are asked for when reached, not at startup
        if (open) void loadProviders().then(() => fetchModels());
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isLoading}
          title={current ? `Model: ${current.displayName}` : "Choose a model"}
          className="inline-flex min-w-0 shrink items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-progress"
        >
          {hosted ? (
            <Cloud className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Cpu className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="max-w-[10rem] truncate">
            {current?.displayName ?? "Choose a model"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        <ModelPickerMenu
          models={models}
          currentModelId={currentModelId}
          onSelect={onSelect}
          onOpenLibrary={onOpenLibrary}
          onOpenSettings={onOpenSettings}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
