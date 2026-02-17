import { useCallback, type MutableRefObject } from "react";
import type { Message } from "./useLlama";
import type { ModelSettings } from "../types/settings";
import type { ChatInputRef } from "../components/chat/ChatInput";
import type { SearchResult, PageContent } from "../types/electron";
import type { ToolCallRequest } from "../handlers/mcpToolHandler";
import type { MCPToolResult } from "@/types";
import { createMessageHandler } from "../handlers/messageHandler";
import { createContinuationHandler } from "../handlers/continuationHandler";
import {
  createEditMessageHandler,
  createRegenerateMessageHandler,
} from "../handlers/editMessageHandler";
import { createTemplateHandler } from "../handlers/templateHandler";

// Generate unique message IDs to prevent React key collisions
let messageIdCounter = 0;
function generateMessageId(): string {
  return `${Date.now()}-${messageIdCounter++}`;
}

interface UseAppHandlersProps {
  isModelLoaded: boolean;
  currentConversation: {
    id: string;
    messages: Message[];
  } | null;
  messages: Message[];
  streamingContentRef: MutableRefObject<string>;
  modelSettings: ModelSettings;
  inputRef: MutableRefObject<ChatInputRef | null>;
  currentModelId: string;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
  sendStreamingMessage: (
    message: string,
    onToken: (token: string) => void,
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      topK?: number;
      repeatPenalty?: number;
    }
  ) => Promise<string>;
  addMessage: (message: Message) => void;
  generateTitle: (userMessage: string) => Promise<string | null>;
  updateTitle: (title: string) => void;
  saveCurrentConversation: () => Promise<void>;
  stopGeneration: () => Promise<void>;
  clearHistory: () => Promise<void>;
  setChatHistory: (messages: Message[]) => Promise<void>;
  createNewConversation: (title: string, modelId: string) => void;
  setSystemPrompt: (prompt: string) => Promise<void>;
  performWebSearch?: (query: string) => Promise<{
    results: SearchResult[];
    contents: PageContent[];
  } | null>;
  setIsSearching?: React.Dispatch<React.SetStateAction<boolean>>;
  clearResults?: () => void;
  handleToolCallRequest?: (request: ToolCallRequest) => Promise<MCPToolResult>;
  isMCPReady?: boolean;
}

export function useAppHandlers({
  isModelLoaded,
  currentConversation,
  messages,
  streamingContentRef,
  modelSettings,
  inputRef,
  currentModelId,
  setMessages,
  setIsGenerating,
  setStreamingContent,
  sendStreamingMessage,
  addMessage,
  generateTitle,
  updateTitle,
  saveCurrentConversation,
  stopGeneration,
  clearHistory,
  setChatHistory,
  createNewConversation,
  setSystemPrompt,
  performWebSearch,
  setIsSearching,
  clearResults,
  handleToolCallRequest,
  isMCPReady,
}: UseAppHandlersProps) {
  const handleSendMessage = createMessageHandler({
    isModelLoaded,
    currentConversation,
    setMessages,
    setIsGenerating,
    setStreamingContent,
    streamingContentRef,
    sendStreamingMessage,
    addMessage,
    generateTitle,
    updateTitle,
    saveCurrentConversation,
    modelSettings,
    performWebSearch,
    setIsSearching,
    handleToolCallRequest,
    isMCPReady,
  });

  const handleStopGenerating = useCallback(async () => {
    try {
      await stopGeneration();
      setIsGenerating(false);

      if (streamingContentRef.current) {
        const assistantMessage: Message = {
          id: generateMessageId(),
          role: "assistant",
          content: streamingContentRef.current,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      setStreamingContent("");
      streamingContentRef.current = "";
    } catch (err) {
      console.error("Error stopping generation:", err);
    }
  }, [
    stopGeneration,
    setIsGenerating,
    setMessages,
    setStreamingContent,
    streamingContentRef,
  ]);

  const handleClearHistory = useCallback(async () => {
    if (!window.llama) {
      console.warn("[App] Cannot clear history - window.llama not available");
      return;
    }
    try {
      await clearHistory();
      setMessages([]);
    } catch (err) {
      console.error("[App] Failed to clear history:", err);
    }
  }, [clearHistory, setMessages]);

  const handleNewChat = useCallback(() => {
    if (currentConversation && currentConversation.messages.length > 0) {
      saveCurrentConversation();
    }
    createNewConversation("New Chat", currentModelId);
    setMessages([]);
    clearHistory();
    clearResults?.();
  }, [
    currentConversation,
    saveCurrentConversation,
    createNewConversation,
    currentModelId,
    clearHistory,
    clearResults,
    setMessages,
  ]);

  const handleContinue = createContinuationHandler({
    messages,
    setMessages,
    setIsGenerating,
    setStreamingContent,
    streamingContentRef,
    sendStreamingMessage,
    addMessage,
    saveCurrentConversation,
    modelSettings,
  });

  const handleEditMessage = createEditMessageHandler({
    messages,
    setMessages,
    setChatHistory,
    setIsGenerating,
    setStreamingContent,
    streamingContentRef,
    sendStreamingMessage,
    addMessage,
    saveCurrentConversation,
    modelSettings,
  });

  const handleRegenerateMessage = createRegenerateMessageHandler({
    messages,
    setMessages,
    setChatHistory,
    setIsGenerating,
    setStreamingContent,
    streamingContentRef,
    sendStreamingMessage,
    addMessage,
    saveCurrentConversation,
    modelSettings,
  });

  const handleTemplateSelect = createTemplateHandler(
    () => createNewConversation("New Chat", currentModelId),
    setSystemPrompt,
    setMessages,
    clearHistory,
    inputRef
  );

  return {
    handleSendMessage,
    handleStopGenerating,
    handleClearHistory,
    handleNewChat,
    handleContinue,
    handleEditMessage,
    handleRegenerateMessage,
    handleTemplateSelect,
  };
}
