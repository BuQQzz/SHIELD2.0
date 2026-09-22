import { useEffect } from "react";
import type { Message } from "../hooks/useLlama";
import { stripToolCallMarkup } from "@/handlers/mcpToolHandler";

interface UseConversationSyncProps {
  currentConversation: {
    id: string;
    messages: Message[];
  } | null;
  isModelLoaded: boolean;
  setChatHistory: (messages: Message[]) => Promise<void>;
  clearHistory: () => Promise<void>;
  setMessages: (messages: Message[]) => void;
  /**
   * Plan mode. The model's own earlier tool calls are still sitting in the
   * history, and in-context examples beat a system prompt: it copies them and
   * calls tools anyway. Strip them before the history goes to the model.
   */
  planOnly?: boolean;
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
  planOnly = false,
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
      // Only the model's view is edited - the stored conversation and what
      // the user sees on screen are untouched.
      const historyForModel = planOnly
        ? currentConversation.messages.map((message) =>
            message.role === "assistant"
              ? { ...message, content: stripToolCallMarkup(message.content) }
              : message
          )
        : currentConversation.messages;

      setChatHistory(historyForModel).catch((err) => {
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
  }, [
    currentConversation,
    isModelLoaded,
    setChatHistory,
    clearHistory,
    planOnly,
  ]);
}
