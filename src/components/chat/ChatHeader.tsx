"use client";

import { Menu, MoreVertical, Settings, Loader2, Upload, Trash2, FileJson, FileText } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useConversationStore } from "@/stores/conversation-store";
import { ModelSelector, type ModelOption } from "./ModelSelector";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatHeaderProps {
  modelName?: string;
  isLoading?: boolean;
  error?: string | null;
  onModelSelect?: (model: ModelOption) => void;
  availableModels?: ModelOption[];
  currentModelId?: string;
  onOpenSettings?: () => void;
  onClearHistory?: () => void;
}

export function ChatHeader({
  modelName,
  isLoading,
  error,
  onModelSelect,
  availableModels = [],
  currentModelId,
  onOpenSettings,
  onClearHistory,
}: ChatHeaderProps) {
  const { sidebarOpen, toggleSidebar } = useChatStore();
  const { currentConversation, loadConversation } = useConversationStore();

  const handleExportJSON = async () => {
    if (!currentConversation) return;
    const success = await window.electronAPI.export.exportJSON(
      currentConversation
    );
    if (success) {
      console.log("Conversation exported as JSON");
    }
  };

  const handleExportMarkdown = async () => {
    if (!currentConversation) return;
    const success = await window.electronAPI.export.exportMarkdown(
      currentConversation
    );
    if (success) {
      console.log("Conversation exported as Markdown");
    }
  };

  const handleImport = async () => {
    const conversation = await window.electronAPI.export.import();
    if (conversation) {
      // Load the imported conversation
      loadConversation(conversation.id);
    }
  };

  return (
    <header className="flex h-14 items-center justify-between bg-background px-4 mb-2">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="md:flex rounded-md p-2 transition-all hover:bg-accent"
            style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)" }}
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold">SHIELD 2.0</h1>
          {isLoading ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {modelName
                ? `Loading ${modelName}...`
                : "Downloading and loading model..."}
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
          onClick={onOpenSettings}
          className="rounded-md p-2 transition-all hover:bg-accent"
          style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)" }}
        >
          <Settings className="h-5 w-5" />
        </button>

        {/* Options Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-md p-2 transition-all hover:bg-accent"
              style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)" }}
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Import */}
            <DropdownMenuItem onClick={handleImport}>
              <Upload className="mr-2 h-4 w-4" />
              Import Conversation
            </DropdownMenuItem>

            {/* Export options - only show if conversation exists */}
            {currentConversation && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportJSON}>
                  <FileJson className="mr-2 h-4 w-4" />
                  Export as JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportMarkdown}>
                  <FileText className="mr-2 h-4 w-4" />
                  Export as Markdown
                </DropdownMenuItem>
              </>
            )}

            {/* Clear History */}
            {onClearHistory && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onClearHistory}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear History
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
