"use client";

import { useState, useRef, useEffect } from "react";
import { ChatLayout } from "./components/chat/ChatLayout";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatPlaceholder } from "./components/chat/ChatPlaceholder";
import { MessageList } from "./components/chat/MessageList";
import { ChatInput } from "./components/chat/ChatInput";
import { useLlama, type Message } from "./hooks/useLlama";
import { useConversationStore } from "./stores/conversation-store";
import { useConversationSync } from "./hooks/useConversationSync";
import { createMessageHandler } from "./handlers/messageHandler";
import { AVAILABLE_MODELS } from "./config/models";
import type { ModelOption } from "./components/chat/ModelSelector";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentModelId, setCurrentModelId] = useState<string>("qwen-7b");
  const streamingContentRef = useRef("");

  const {
    isInitialized,
    isModelLoaded,
    currentModel,
    isLoading,
    error,
    loadModel,
    sendStreamingMessage,
    clearHistory,
    setChatHistory,
    generateTitle,
    stopGeneration,
  } = useLlama();

  const {
    currentConversation,
    createNewConversation,
    addMessage,
    updateTitle,
    saveCurrentConversation,
  } = useConversationStore();

  // Initialize a new conversation if none exists
  useEffect(() => {
    if (!currentConversation) {
      createNewConversation("New Chat", currentModelId);
    }
  }, [currentConversation, createNewConversation, currentModelId]);

  // Sync messages and restore chat history
  useConversationSync({
    currentConversation,
    isModelLoaded,
    setChatHistory,
    clearHistory,
    setMessages,
  });

  // Auto-load model on initialization
  useEffect(() => {
    if (isInitialized && !isModelLoaded && !isLoading && !currentModel) {
      console.log("[App] Auto-loading default model...");
      const defaultModel = AVAILABLE_MODELS.find(
        (m) => m.id === currentModelId
      );
      if (defaultModel) {
        loadModel({
          name: defaultModel.name,
          uri: defaultModel.uri,
          contextSize: defaultModel.contextSize,
        }).catch((err) => {
          console.error("[App] Failed to auto-load model:", err);
        });
      }
    }
  }, [
    isInitialized,
    isModelLoaded,
    isLoading,
    currentModel,
    loadModel,
    currentModelId,
  ]);

  const handleModelSelect = async (model: ModelOption) => {
    if (isLoading) return;

    console.log("[App] Switching to model:", model.displayName);
    setCurrentModelId(model.id);

    try {
      await loadModel({
        name: model.name,
        uri: model.uri,
        contextSize: model.contextSize,
      });
      console.log("[App] Model switched successfully");
    } catch (err) {
      console.error("[App] Failed to switch model:", err);
    }
  };

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
  });

  const handleStopGenerating = async () => {
    try {
      await stopGeneration();
      setIsGenerating(false);

      if (streamingContentRef.current) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
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
  };

  const handleClearHistory = async () => {
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
  };

  const handleNewChat = () => {
    if (currentConversation && currentConversation.messages.length > 0) {
      saveCurrentConversation();
    }
    createNewConversation("New Chat", currentModelId);
    setMessages([]);
    clearHistory();
  };

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          onClearHistory={handleClearHistory}
          onNewChat={handleNewChat}
        />
      }
    >
      <div className="flex h-full flex-col">
        <ChatHeader
          modelName={currentModel?.name}
          isLoading={isLoading}
          error={error}
          availableModels={AVAILABLE_MODELS}
          currentModelId={currentModelId}
          onModelSelect={handleModelSelect}
        />
        {messages.length === 0 && !streamingContent ? (
          <ChatPlaceholder
            modelLoaded={isModelLoaded}
            isLoading={isLoading}
            onPromptClick={handleSendMessage}
          />
        ) : (
          <MessageList
            messages={messages}
            streamingContent={streamingContent}
            isGenerating={isGenerating}
          />
        )}
        <ChatInput
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          onStop={handleStopGenerating}
          disabled={!isModelLoaded}
        />
      </div>
    </ChatLayout>
  );
}

export default App;
