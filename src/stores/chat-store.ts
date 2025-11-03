import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatStore {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  currentChatId: string | null;
  toggleSidebar: () => void;
  toggleSidebarCollapse: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCurrentChatId: (id: string | null) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      currentChatId: null,
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      toggleSidebarCollapse: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setCurrentChatId: (id) => set({ currentChatId: id }),
    }),
    {
      name: "chat-storage",
    }
  )
);
