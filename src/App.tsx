"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { ChatLayout } from "./components/chat/ChatLayout";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatPlaceholder } from "./components/chat/ChatPlaceholder";
import { MessageList } from "./components/chat/MessageList";
import { ChatInput, type ChatInputRef } from "./components/chat/ChatInput";
import { LazySettingsDialog, LazyTemplateSelector } from "./components/lazy";
import { ToolPermissionBar } from "./components/chat/ToolPermissionBar";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { Toaster } from "./components/ui/sonner";
import { useLlama, type Message } from "./hooks/useLlama";
import { useConversationStore } from "./stores/conversation-store";
import { useConversationSync } from "./hooks/useConversationSync";
import { useSettingsStore } from "./store/settingsStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWebSearch } from "./hooks/useWebSearch";
import { useAppHandlers } from "./hooks/useAppHandlers";
import { useModelLoader } from "./hooks/useModelLoader";
import { useMCP } from "./hooks/useMCP";
import { useMCPDialogs } from "./hooks/useMCPDialogs";
import { useMCPSystemPrompt } from "./hooks/useMCPSystemPrompt";
import { useMCPTools } from "./hooks/useMCPTools";
import { useToolPolicy } from "./hooks/useToolPolicy";
import { useInstalledModels } from "./hooks/useInstalledModels";
import { createAppShortcuts } from "./config/shortcuts";
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

  // Load installed models
  const { installedModels, isLoading: isLoadingModels } = useInstalledModels();

  const {
    isInitialized,
    isModelLoaded,
    currentModel,
    isLoading,
    error,
    warning,
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
  const {
    isReady: isMCPReady,
    isInitializing: isMCPInitializing,
    initialize: initializeMCP,
    callTool,
  } = useMCP();

  // What the connected MCP servers actually expose
  const {
    tools: mcpServerTools,
    allowedPaths: mcpAllowedPaths,
    settled: mcpToolsSettled,
  } = useMCPTools(isMCPReady);

  // The single place the permission mode turns into behaviour: what the model
  // is told exists, what stops for a prompt, and whether anything runs.
  const toolPolicy = useToolPolicy({
    mode: settings.mcp?.mode ?? "ask",
    allowedTools: settings.mcp?.allowedTools ?? [],
    serverTools: mcpServerTools,
  });

  // MCP dialog management
  const {
    pendingRequest,
    runningTool,
    handleToolCallRequest,
    handleApprove,
    handleDeny,
  } = useMCPDialogs({ callTool, policy: toolPolicy });

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Sync HuggingFace token to main process when settings load
  useEffect(() => {
    const syncHfToken = async () => {
      const token = settings.system.huggingFaceToken;
      try {
        await window.electronAPI.modelDownload.setHfToken(token || undefined);
      } catch (error) {
        console.error("Failed to sync HF token:", error);
      }
    };
    syncHfToken();
  }, [settings.system.huggingFaceToken]);

  // Auto-initialize MCP at startup
  useEffect(() => {
    const autoInitializeMCP = async () => {
      if (isMCPReady || isMCPInitializing) {
        return;
      }

      try {
        await initializeMCP();
      } catch (error) {
        console.error("Failed to auto-initialize MCP:", error);
      }
    };

    autoInitializeMCP();
  }, [isMCPReady, isMCPInitializing, initializeMCP]);

  // MCP system prompt management - builds model-specific prompts
  const currentModelConfig = installedModels.find(
    (m) => m.id === currentModelId
  );
  // Real tool list from the connected MCP servers
  useMCPSystemPrompt({
    isModelLoaded,
    isMCPReady,
    mcpEnabled: true,
    baseSystemPrompt: settings.system.systemPrompt,
    setSystemPrompt,
    modelName: currentModelConfig?.name,
    modelCapabilities: currentModelConfig?.capabilities,
    webSearchEnabled: settings.webSearch?.enabled,
    availableTools: toolPolicy.advertisedTools,
    allowedPaths: mcpAllowedPaths,
    planOnly: toolPolicy.isPlanning,
    toolsLoading: !mcpToolsSettled,
  });

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
    planOnly: toolPolicy.isPlanning,
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
    installedModels,
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
    handleToolCallRequest, // Pass MCP handler
    isMCPReady,
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
          isLoading={isLoading || isLoadingModels}
          error={error}
          warning={warning}
          availableModels={installedModels}
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
            runningTool={runningTool}
          />
        )}
        <ToolPermissionBar
          request={pendingRequest}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
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
          currentModel={installedModels.find((m) => m.id === currentModelId)}
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
      <Toaster />
    </ThemeProvider>
  );
}

export default AppWithTheme;
