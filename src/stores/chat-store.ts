import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChatStore {
  sidebarOpen: boolean;
  currentChatId: string | null;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentChatId: (id: string | null) => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      currentChatId: null,
      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setCurrentChatId: (id) => set({ currentChatId: id }),
    }),
    {
      name: "chat-storage",
    },
  ),
);
