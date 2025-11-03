"use client";

import { Menu, MoreVertical, Settings, Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { ModelSelector, type ModelOption } from "./ModelSelector";

interface ChatHeaderProps {
  modelName?: string;
  isLoading?: boolean;
  error?: string | null;
  onModelSelect?: (model: ModelOption) => void;
  availableModels?: ModelOption[];
  currentModelId?: string;
}

export function ChatHeader({ 
  modelName, 
  isLoading, 
  error,
  onModelSelect,
  availableModels = [],
  currentModelId,
}: ChatHeaderProps) {
  const { sidebarOpen, toggleSidebar } = useChatStore();

  return (
    <header className="flex h-14 items-center justify-between bg-background px-4 mb-2">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="md:flex rounded-md p-2 transition-all hover:bg-accent"
            style={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)' }}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold">SHIELD 2.0</h1>
          {isLoading ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {modelName ? `Loading ${modelName}...` : "Downloading and loading model..."}
            </span>
          ) : error ? (
            <span className="text-xs text-destructive">{error}</span>
          ) : modelName ? (
            <span className="text-xs text-muted-foreground">{modelName}</span>
          ) : null}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {availableModels.length > 0 && onModelSelect && (
          <ModelSelector
            models={availableModels}
            currentModel={currentModelId}
            onModelSelect={onModelSelect}
            disabled={isLoading}
            isLoading={isLoading}
          />
        )}
        <button
          className="rounded-md p-2 transition-all hover:bg-accent"
          style={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)' }}
        >
          <Settings className="h-5 w-5" />
        </button>
        <button
          className="rounded-md p-2 transition-all hover:bg-accent"
          style={{ boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)' }}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}

