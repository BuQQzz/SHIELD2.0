"use client";

import { ReactNode } from "react";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";

interface ChatLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
}

export function ChatLayout({ children, sidebar }: ChatLayoutProps) {
  const { sidebarOpen, sidebarCollapsed } = useChatStore();

  // Calculate sidebar width based on both open and collapsed states
  const sidebarWidth = sidebarOpen
    ? sidebarCollapsed
      ? "64px"
      : "260px"
    : "0";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-page">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-full shrink-0 bg-page transition-all duration-300 ease-in-out md:relative md:z-0",
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:-translate-x-0 md:w-0"
        )}
        style={{ width: sidebarWidth }}
      >
        {sidebar}
      </aside>

      {/* Main Content: min-w-0 lets it narrow with the window. Without it
          the column kept the width of its widest line (a long tool step)
          and a narrowed window cut the chat off on the right (2026-10-28).
          It floats on the page as one panel: depth instead of a line */}
      <main
        className={cn(
          "relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background transition-all duration-200 ease-in-out md:my-2 md:mr-2 md:rounded-2xl md:shadow-panel",
          sidebarOpen ? "md:ml-0" : "md:ml-2"
        )}
      >
        {children}
      </main>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => useChatStore.getState().setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
