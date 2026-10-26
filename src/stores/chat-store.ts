import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The main panel the sidebar's navigation shows */
export type AppView = "chat" | "code" | "library" | "plugins";

interface ChatStore {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  currentChatId: string | null;
  activeView: AppView;
  toggleSidebar: () => void;
  toggleSidebarCollapse: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCurrentChatId: (id: string | null) => void;
  setActiveView: (view: AppView) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      currentChatId: null,
      activeView: "chat",
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleSidebarCollapse: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setCurrentChatId: (id) => set({ currentChatId: id }),
      setActiveView: (view) => set({ activeView: view }),
    }),
    {
      name: "chat-storage",
      // The app always opens on the chat
      partialize: ({ activeView: _activeView, ...rest }) => rest,
    }
  )
);
