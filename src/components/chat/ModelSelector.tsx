"use client";

import { Check, ChevronDown, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
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
        <button
          disabled={disabled || isLoading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-background px-3 py-2 text-sm font-medium transition-all hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
          style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)" }}
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
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {models.map((model, index) => (
          <motion.div
            key={model.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
          >
            <DropdownMenuItem
              onClick={() => onModelSelect(model)}
              disabled={isLoading}
              className="flex flex-col items-start gap-1 p-3 cursor-pointer transition-colors"
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
          </motion.div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
