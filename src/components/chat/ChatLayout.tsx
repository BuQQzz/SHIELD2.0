"use client";

import { ReactNode } from "react";
import { useChatStore } from "@/stores/chat-store";
import { cn } from "@/lib/utils";

interface ChatLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
}

export function ChatLayout({ children, sidebar }: ChatLayoutProps) {
  const { sidebarOpen } = useChatStore();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-full border-r border-border bg-background transition-transform duration-200 ease-in-out md:relative md:z-0",
          sidebarOpen
            ? "translate-x-0"
            : "-translate-x-full md:-translate-x-0 md:w-0",
        )}
        style={{ width: sidebarOpen ? "260px" : "0" }}
      >
        {sidebar}
      </aside>

      {/* Main Content */}
      <main
        className={cn(
          "flex flex-1 flex-col transition-all duration-200 ease-in-out",
          sidebarOpen ? "md:ml-0" : "ml-0",
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
