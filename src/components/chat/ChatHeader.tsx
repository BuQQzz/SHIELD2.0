"use client";

import {
  Menu,
  MoreVertical,
  Loader2,
  Upload,
  Trash2,
  FileJson,
  FileText,
  Tag as TagIcon,
  Plus,
} from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useConversationStore } from "@/stores/conversation-store";
import { ModelSelector, type ModelOption } from "./ModelSelector";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Tag } from "./Tag";
import { MCPStatus } from "./MCPStatus";

interface ChatHeaderProps {
  modelName?: string;
  isLoading?: boolean;
  error?: string | null;
  onModelSelect?: (model: ModelOption) => void;
  availableModels?: ModelOption[];
  currentModelId?: string;
  onClearHistory?: () => void;
}

export function ChatHeader({
  modelName,
  isLoading,
  error,
  onModelSelect,
  availableModels = [],
  currentModelId,
  onClearHistory,
}: ChatHeaderProps) {
  const { sidebarOpen, toggleSidebar } = useChatStore();
  const {
    currentConversation,
    loadConversation,
    updateConversation,
    saveCurrentConversation,
  } = useConversationStore();
  const [newTagInput, setNewTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const handleAddTag = async (tag: string) => {
    if (!currentConversation || !tag.trim()) return;

    const currentTags = currentConversation.tags || [];
    if (currentTags.includes(tag.trim())) return; // Don't add duplicates

    updateConversation({
      tags: [...currentTags, tag.trim()],
    });
    await saveCurrentConversation();
    setNewTagInput("");
    setShowTagInput(false);
  };

  const handleRemoveTag = async (tag: string) => {
    if (!currentConversation) return;

    const currentTags = currentConversation.tags || [];
    updateConversation({
      tags: currentTags.filter((t) => t !== tag),
    });
    await saveCurrentConversation();
  };

  const handleExportJSON = async () => {
    if (!currentConversation) return;
    const success =
      await window.electronAPI.export.exportJSON(currentConversation);
    if (success) {
      console.log("Conversation exported as JSON");
    }
  };

  const handleExportMarkdown = async () => {
    if (!currentConversation) return;
    const success =
      await window.electronAPI.export.exportMarkdown(currentConversation);
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
        <MCPStatus />
        
        {availableModels.length > 0 && onModelSelect && (
          <ModelSelector
            models={availableModels}
            currentModel={currentModelId}
            onModelSelect={onModelSelect}
            disabled={isLoading}
            isLoading={isLoading}
          />
        )}

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
          <DropdownMenuContent align="end" className="w-56">
            {/* Import */}
            <DropdownMenuItem onClick={handleImport}>
              <Upload className="mr-2 h-4 w-4" />
              Import Conversation
            </DropdownMenuItem>

            {/* Tag Management - only show if conversation exists */}
            {currentConversation && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <TagIcon className="mr-2 h-4 w-4" />
                    Manage Tags
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    {/* Show existing tags */}
                    {currentConversation.tags &&
                    currentConversation.tags.length > 0 ? (
                      <div className="p-2 space-y-1">
                        <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                          Current Tags
                        </div>
                        <div className="flex flex-wrap gap-1 px-2">
                          {currentConversation.tags.map((tag) => (
                            <Tag
                              key={tag}
                              label={tag}
                              onRemove={() => handleRemoveTag(tag)}
                              variant="compact"
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 text-xs text-muted-foreground text-center">
                        No tags yet
                      </div>
                    )}

                    <DropdownMenuSeparator />

                    {/* Add new tag */}
                    {showTagInput ? (
                      <div className="p-2">
                        <input
                          type="text"
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleAddTag(newTagInput);
                            } else if (e.key === "Escape") {
                              setShowTagInput(false);
                              setNewTagInput("");
                            }
                          }}
                          onBlur={() => {
                            if (!newTagInput.trim()) {
                              setShowTagInput(false);
                            }
                          }}
                          placeholder="Tag name..."
                          className="w-full px-2 py-1 text-sm rounded border bg-background"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <DropdownMenuItem onClick={() => setShowTagInput(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Tag
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

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
