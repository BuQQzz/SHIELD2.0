import { useEffect } from "react";
import type { Message } from "../hooks/useLlama";

interface UseConversationSyncProps {
  currentConversation: {
    id: string;
    messages: Message[];
  } | null;
  isModelLoaded: boolean;
  setChatHistory: (messages: Message[]) => Promise<void>;
  clearHistory: () => Promise<void>;
  setMessages: (messages: Message[]) => void;
}

/**
 * Syncs UI messages with current conversation and restores LLM chat history
 */
export function useConversationSync({
  currentConversation,
  isModelLoaded,
  setChatHistory,
  clearHistory,
  setMessages,
}: UseConversationSyncProps) {
  // Sync messages with current conversation
  useEffect(() => {
    if (currentConversation) {
      setMessages(currentConversation.messages);
    }
  }, [currentConversation, setMessages]);

  // Restore chat history when conversation changes (for LLM memory)
  useEffect(() => {
    if (
      currentConversation &&
      currentConversation.messages.length > 0 &&
      isModelLoaded
    ) {
      console.log(
        "[App] Restoring chat history for conversation:",
        currentConversation.id
      );
      setChatHistory(currentConversation.messages).catch((err) => {
        console.error("[App] Failed to restore chat history:", err);
      });
    } else if (
      currentConversation &&
      currentConversation.messages.length === 0 &&
      isModelLoaded
    ) {
      // New conversation - clear history
      console.log("[App] New conversation - clearing history");
      clearHistory().catch((err) => {
        console.error("[App] Failed to clear history:", err);
      });
    }
  }, [currentConversation, isModelLoaded, setChatHistory, clearHistory]);
}
