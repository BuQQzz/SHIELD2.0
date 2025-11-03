"use client";

import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ModelOption {
  id: string;
  name: string;
  displayName: string;
  uri: string;
  size: string;
  description: string;
  contextSize: number;
}

interface ModelSelectorProps {
  models: ModelOption[];
  currentModel?: string;
  onModelSelect: (model: ModelOption) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function ModelSelector({
  models,
  currentModel,
  onModelSelect,
  disabled = false,
  isLoading = false,
}: ModelSelectorProps) {
  const selectedModel = models.find((m) => m.id === currentModel);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              {selectedModel?.displayName || "Select Model"}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelSelect(model)}
            disabled={isLoading}
            className="flex flex-col items-start gap-1 p-3"
          >
            <div className="flex w-full items-center justify-between">
              <span className="font-medium">{model.displayName}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {model.size}
                </span>
                {currentModel === model.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              {model.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
