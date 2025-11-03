import { create } from "zustand";
import type { Conversation, ConversationMetadata, Message } from "../types/electron";

interface ConversationState {
  // Current conversation
  currentConversation: Conversation | null;
  // List of all conversations
  conversations: ConversationMetadata[];
  // Search query for filtering
  searchQuery: string;
  // Loading states
  isLoading: boolean;
  isSaving: boolean;

  // Actions
  setCurrentConversation: (conversation: Conversation | null) => void;
  setConversations: (conversations: ConversationMetadata[]) => void;
  setSearchQuery: (query: string) => void;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;

  // Conversation operations
  createNewConversation: (title?: string, modelId?: string) => void;
  addMessage: (message: Message) => void;
  updateConversation: (updates: Partial<Conversation>) => void;

  // Async operations
  saveCurrentConversation: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  loadConversationList: () => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  searchConversations: (query: string) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  currentConversation: null,
  conversations: [],
  searchQuery: "",
  isLoading: false,
  isSaving: false,

  setCurrentConversation: (conversation) => set({ currentConversation: conversation }),
  setConversations: (conversations) => set({ conversations }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setLoading: (loading) => set({ isLoading: loading }),
  setSaving: (saving) => set({ isSaving: saving }),

  createNewConversation: (title, modelId) => {
    const now = new Date();
    const newConversation: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: title || "New Conversation",
      messages: [],
      createdAt: now,
      updatedAt: now,
      modelId,
    };
    set({ currentConversation: newConversation });
  },

  addMessage: (message) => {
    const { currentConversation } = get();
    if (!currentConversation) {
      console.error("No current conversation to add message to");
      return;
    }

    const updatedConversation: Conversation = {
      ...currentConversation,
      messages: [...currentConversation.messages, message],
      updatedAt: new Date(),
    };

    set({ currentConversation: updatedConversation });
  },

  updateConversation: (updates) => {
    const { currentConversation } = get();
    if (!currentConversation) return;

    const updatedConversation: Conversation = {
      ...currentConversation,
      ...updates,
      updatedAt: new Date(),
    };

    set({ currentConversation: updatedConversation });
  },

  saveCurrentConversation: async () => {
    const { currentConversation } = get();
    if (!currentConversation) return;

    set({ isSaving: true });
    try {
      const result = await window.conversations.save(currentConversation);
      if (!result.success) {
        console.error("Failed to save conversation:", result.error);
      } else {
        // Refresh conversation list
        await get().loadConversationList();
      }
    } catch (error) {
      console.error("Error saving conversation:", error);
    } finally {
      set({ isSaving: false });
    }
  },

  loadConversation: async (conversationId) => {
    set({ isLoading: true });
    try {
      const result = await window.conversations.load(conversationId);
      if (result.conversation) {
        set({ currentConversation: result.conversation });
      } else {
        console.error("Failed to load conversation:", result.error);
      }
    } catch (error) {
      console.error("Error loading conversation:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadConversationList: async () => {
    try {
      const result = await window.conversations.list();
      if (result.conversations) {
        set({ conversations: result.conversations });
      } else {
        console.error("Failed to load conversations:", result.error);
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  },

  deleteConversation: async (conversationId) => {
    try {
      const result = await window.conversations.delete(conversationId);
      if (result.success) {
        // If deleted conversation is current, clear it
        const { currentConversation } = get();
        if (currentConversation?.id === conversationId) {
          set({ currentConversation: null });
        }
        // Refresh conversation list
        await get().loadConversationList();
      } else {
        console.error("Failed to delete conversation:", result.error);
      }
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  },

  searchConversations: async (query) => {
    set({ searchQuery: query });
    if (!query.trim()) {
      await get().loadConversationList();
      return;
    }

    try {
      const result = await window.conversations.search(query);
      if (result.conversations) {
        set({ conversations: result.conversations });
      } else {
        console.error("Failed to search conversations:", result.error);
      }
    } catch (error) {
      console.error("Error searching conversations:", error);
    }
  },
}));
