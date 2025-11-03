"use client";

import { Menu, MoreVertical, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatStore } from "@/stores/chat-store";

interface ChatHeaderProps {
  modelName?: string;
  isLoading?: boolean;
  error?: string | null;
}

export function ChatHeader({ modelName, isLoading, error }: ChatHeaderProps) {
  const { sidebarOpen, toggleSidebar } = useChatStore();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="md:flex"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold">SHIELD 2.0</h1>
          {isLoading ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading model...
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
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}

