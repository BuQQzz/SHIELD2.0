"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Menu,
  MoreVertical,
  Loader2,
  Upload,
  Trash2,
  FileJson,
  FileText,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useChatStore } from "@/stores/chat-store";
import { useConversationStore } from "@/stores/conversation-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SummariesMenu, type ChatSummary } from "./SummariesMenu";

interface ChatHeaderProps {
  /** Named in the loading line; the composer's picker shows the model */
  modelName?: string;
  isLoading?: boolean;
  error?: string | null;
  warning?: string | null;
  onClearHistory?: () => void;
}

export function ChatHeader({
  modelName,
  isLoading,
  error,
  warning,
  onClearHistory,
}: ChatHeaderProps) {
  const { sidebarOpen, toggleSidebar } = useChatStore();
  const { currentConversation, loadConversation } = useConversationStore();
  const lastWarningRef = useRef<string | null>(null);

  // Replies that had to summarise earlier turns first
  const summaries = useMemo(
    () =>
      (currentConversation?.messages ?? []).flatMap((m): ChatSummary[] =>
        m.summary
          ? [{ id: m.id, summary: m.summary, timestamp: m.timestamp }]
          : []
      ),
    [currentConversation?.messages]
  );

  // Show warning as toast notification (only once per unique warning)
  useEffect(() => {
    if (warning && warning !== lastWarningRef.current) {
      lastWarningRef.current = warning;
      toast.warning(warning, {
        duration: 8000,
        id: "model-warning", // Prevents duplicate toasts
      });
    } else if (!warning) {
      lastWarningRef.current = null;
    }
  }, [warning]);

  const handleExportJSON = async () => {
    if (!currentConversation) return;
    const success =
      await window.electronAPI.export.exportJSON(currentConversation);
    if (success) {
      toast.success("Conversation exported as JSON");
    }
  };

  const handleExportMarkdown = async () => {
    if (!currentConversation) return;
    const success =
      await window.electronAPI.export.exportMarkdown(currentConversation);
    if (success) {
      toast.success("Conversation exported as Markdown");
    }
  };

  const handleImport = async () => {
    const conversation = await window.electronAPI.export.import();
    if (conversation) {
      toast.success("Conversation imported successfully");
      // Load the imported conversation
      loadConversation(conversation.id);
    }
  };

  return (
    <header className="flex h-12 items-center justify-between bg-background px-3">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <motion.button
            onClick={toggleSidebar}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="md:flex rounded-md p-2 transition-colors hover:bg-foreground/5"
          >
            <Menu className="h-5 w-5" />
          </motion.button>
        )}
        <div className="flex flex-col">
          {isLoading ? (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {modelName
                ? `Loading ${modelName}...`
                : "Downloading and loading model..."}
            </span>
          ) : error ? (
            <span className="text-sm text-destructive">{error}</span>
          ) : null}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        <SummariesMenu
          conversationId={currentConversation?.id}
          summaries={summaries}
        />

        {/* Options Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="rounded-md p-2 transition-colors hover:bg-foreground/5"
            >
              <MoreVertical className="h-5 w-5" />
            </motion.button>
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
