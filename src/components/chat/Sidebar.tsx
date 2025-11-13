"use client";

import {
  Shield,
  Plus,
  Search,
  PanelLeft,
  PanelRight,
  Settings,
  Sparkles,
} from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { useConversationStore } from "@/stores/conversation-store";
import { ConversationList } from "./ConversationList";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface SidebarProps {
  onNewChat?: () => void;
  onNewFromTemplate?: () => void;
  onOpenSettings?: () => void;
}

export function Sidebar({
  onNewChat,
  onNewFromTemplate,
  onOpenSettings,
}: SidebarProps) {
  const { sidebarOpen, sidebarCollapsed, toggleSidebarCollapse } =
    useChatStore();
  const {
    conversations,
    currentConversation,
    loadConversationList,
    loadConversation,
    deleteConversation,
    searchConversations,
    createNewConversation,
  } = useConversationStore();

  const [searchInput, setSearchInput] = useState("");

  // Load conversations on mount
  useEffect(() => {
    loadConversationList();
  }, [loadConversationList]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    if (value.trim()) {
      searchConversations(value);
    } else {
      loadConversationList();
    }
  };

  const handleNewChat = () => {
    createNewConversation();
    onNewChat?.();
  };

  const handleSelectConversation = (conversationId: string) => {
    loadConversation(conversationId);
  };

  const handleDeleteConversation = (conversationId: string) => {
    deleteConversation(conversationId);
  };

  return (
    <AnimatePresence mode="wait">
      {sidebarOpen && (
        <motion.div
          initial={{ x: sidebarCollapsed ? -64 : -260, opacity: 0 }}
          animate={{
            x: 0,
            opacity: 1,
            width: sidebarCollapsed ? 64 : 260,
          }}
          exit={{ x: sidebarCollapsed ? -64 : -260, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="flex h-full flex-col bg-background"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-3 mb-2">
            {!sidebarCollapsed ? (
              <>
                <div className="flex items-center gap-2">
                  <Shield className="h-6 w-6 text-primary" />
                  <span className="font-semibold">SHIELD 2.0</span>
                </div>
                <button
                  onClick={toggleSidebarCollapse}
                  title="Collapse sidebar"
                  className="rounded-md p-1.5 transition-colors hover:bg-accent"
                >
                  <PanelLeft className="h-5 w-5 text-muted-foreground" />
                </button>
              </>
            ) : (
              <button
                onClick={toggleSidebarCollapse}
                title="Expand sidebar"
                className="mx-auto rounded-md p-1.5 transition-colors hover:bg-accent"
              >
                <PanelRight className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Collapsed View - Icon Only */}
          {sidebarCollapsed ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-col items-center gap-2 p-2">
                <motion.button
                  onClick={handleNewChat}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="rounded-md p-2.5 transition-colors hover:bg-accent"
                  title="New Chat"
                >
                  <Plus className="h-4 w-4" />
                </motion.button>
              </div>

              {/* Spacer to push settings to bottom */}
              <div className="flex-1" />

              {/* Settings Icon at Bottom */}
              {onOpenSettings && (
                <div className="flex flex-col items-center p-2">
                  <motion.button
                    onClick={onOpenSettings}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="rounded-md p-2.5 transition-colors hover:bg-accent"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </motion.button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Expanded View - Full Sidebar */}
              {/* New Chat Button */}
              <div className="p-3">
                <div className="flex gap-2">
                  <motion.button
                    onClick={handleNewChat}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Plus className="mr-2 inline h-4 w-4" />
                    New Chat
                  </motion.button>
                  <motion.button
                    onClick={onNewFromTemplate}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    title="New from Template"
                  >
                    <Sparkles className="h-4 w-4" />
                  </motion.button>
                </div>
              </div>

              {/* Search */}
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search chats..."
                    value={searchInput}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full rounded-md bg-background py-2 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              {/* Chat History */}
              <div className="flex-1 overflow-y-auto px-3">
                <ConversationList
                  conversations={conversations}
                  currentConversationId={currentConversation?.id}
                  onSelect={handleSelectConversation}
                  onDelete={handleDeleteConversation}
                />
              </div>

              {/* Settings Footer */}
              {onOpenSettings && (
                <div className="p-3">
                  <motion.button
                    onClick={onOpenSettings}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    <Settings className="mr-2 inline h-4 w-4" />
                    Settings
                  </motion.button>
                </div>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
