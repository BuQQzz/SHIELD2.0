import { useEffect, useRef } from "react";
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
  /** Identifies the loaded model; a different model starts with an empty session */
  modelKey?: string;
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
  modelKey,
}: UseConversationSyncProps) {
  // Sync messages with current conversation
  useEffect(() => {
    if (currentConversation) {
      setMessages(currentConversation.messages);
    }
  }, [currentConversation, setMessages]);

  // Restore chat history when the conversation, model or Plan mode changes -
  // not when a message is added. currentConversation is a new object after
  // every message, and restoring on each one replaced the model's session
  // mid-turn: it re-read the whole chat before every tool round and lost
  // what it had actually been sent (e.g. the [Current folder] note).
  const lastSynced = useRef<string | null>(null);

  useEffect(() => {
    if (!isModelLoaded) {
      lastSynced.current = null; // a model loaded later starts empty
      return;
    }
    if (!currentConversation) return;

    const key = `${currentConversation.id}|${modelKey ?? ""}|${planOnly}`;
    if (key === lastSynced.current) return;
    lastSynced.current = key;

    if (currentConversation.messages.length > 0) {
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
    } else {
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
    modelKey,
  ]);
}
