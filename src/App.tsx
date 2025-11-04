"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { ChatLayout } from "./components/chat/ChatLayout";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatPlaceholder } from "./components/chat/ChatPlaceholder";
import { MessageList } from "./components/chat/MessageList";
import { ChatInput, type ChatInputRef } from "./components/chat/ChatInput";
import { LazySettingsDialog, LazyTemplateSelector } from "./components/lazy";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { useLlama, type Message } from "./hooks/useLlama";
import { useConversationStore } from "./stores/conversation-store";
import { useConversationSync } from "./hooks/useConversationSync";
import { useSettingsStore } from "./store/settingsStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWebSearch } from "./hooks/useWebSearch";
import { useAppHandlers } from "./hooks/useAppHandlers";
import { useModelLoader } from "./hooks/useModelLoader";
import { createAppShortcuts } from "./config/shortcuts";
import { AVAILABLE_MODELS } from "./config/models";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentModelId, setCurrentModelId] = useState<string>("qwen-7b");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [isWebSearching, setIsWebSearching] = useState(false);
  const streamingContentRef = useRef("");
  const inputRef = useRef<ChatInputRef>(null);

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
    setSystemPrompt,
  } = useLlama();

  const {
    currentConversation,
    createNewConversation,
    addMessage,
    updateTitle,
    saveCurrentConversation,
  } = useConversationStore();

  const { settings, loadSettings } = useSettingsStore();
  const { performSearch, clearResults } = useWebSearch();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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

  // Model loading hook
  const { handleModelSelect } = useModelLoader({
    isInitialized,
    isModelLoaded,
    isLoading,
    currentModel,
    currentModelId,
    loadModel,
    setCurrentModelId,
  });

  // App handlers hook
  const {
    handleSendMessage,
    handleStopGenerating,
    handleClearHistory,
    handleNewChat,
    handleContinue,
    handleEditMessage,
    handleRegenerateMessage,
    handleTemplateSelect,
  } = useAppHandlers({
    isModelLoaded,
    currentConversation,
    messages,
    streamingContentRef,
    modelSettings: settings.model,
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
    performWebSearch: performSearch,
    setIsSearching: setIsWebSearching,
    clearResults,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    createAppShortcuts(
      isGenerating,
      settingsOpen,
      handleNewChat,
      handleStopGenerating,
      () => inputRef.current?.focus(),
      setSettingsOpen
    )
  );

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          onNewChat={handleNewChat}
          onNewFromTemplate={() => setTemplateSelectorOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
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
          onClearHistory={handleClearHistory}
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
            isSearching={isWebSearching}
            onContinue={handleContinue}
            onEditMessage={handleEditMessage}
            onRegenerateMessage={handleRegenerateMessage}
          />
        )}
        <ChatInput
          ref={inputRef}
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          onStop={handleStopGenerating}
          disabled={!isModelLoaded}
        />
      </div>

      <Suspense fallback={null}>
        <LazySettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onApplySystemPrompt={setSystemPrompt}
        />
      </Suspense>

      {templateSelectorOpen && (
        <Suspense fallback={null}>
          <LazyTemplateSelector
            onSelect={handleTemplateSelect}
            onClose={() => setTemplateSelectorOpen(false)}
          />
        </Suspense>
      )}
    </ChatLayout>
  );
}

function AppWithTheme() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="shield-ui-theme">
      <App />
    </ThemeProvider>
  );
}

export default AppWithTheme;
