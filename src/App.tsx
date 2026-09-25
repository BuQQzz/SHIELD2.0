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
import { useAppHandlers } from "./hooks/useAppHandlers";
import { useModelLoader } from "./hooks/useModelLoader";
import { useMCP } from "./hooks/useMCP";
import { useMCPDialogs } from "./hooks/useMCPDialogs";
import { useMCPSystemPrompt } from "./hooks/useMCPSystemPrompt";
import { useMCPTools } from "./hooks/useMCPTools";
import { useToolPolicy } from "./hooks/useToolPolicy";
import { useInstalledModels } from "./hooks/useInstalledModels";
import { useChatStore } from "./stores/chat-store";
import { ModelLibraryPage } from "./components/library/ModelLibraryPage";
import { PluginsPage } from "./components/plugins/PluginsPage";
import { LowMemoryDialog } from "./components/models/LowMemoryDialog";
import { DEFAULT_MODEL_ID, isRuntimeAvailable } from "./config/models";
import { createAppShortcuts } from "./config/shortcuts";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentModelId, setCurrentModelId] =
    useState<string>(DEFAULT_MODEL_ID);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const streamingContentRef = useRef("");
  const inputRef = useRef<ChatInputRef>(null);

  // Load installed models
  const {
    installedModels,
    isLoading: isLoadingModels,
    refresh: refreshInstalledModels,
  } = useInstalledModels();
  const activeView = useChatStore((state) => state.activeView);
  const setActiveView = useChatStore((state) => state.setActiveView);

  const {
    isInitialized,
    isModelLoaded,
    currentModel,
    isLoading,
    error,
    warning,
    memoryPrompt,
    confirmLowMemory,
    cancelLowMemory,
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
  } = useMCPTools(isMCPReady, settings.mcp?.workspaceFolder);

  // The single place the permission mode turns into behaviour: what the model
  // is told exists, what stops for a prompt, and whether anything runs.
  const toolPolicy = useToolPolicy({
    mode: settings.mcp?.mode ?? "ask",
    allowedTools: settings.mcp?.allowedTools ?? [],
    serverTools: mcpServerTools,
    webSearchEnabled: settings.webSearch?.enabled ?? false,
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
    // A reload at a new context size is a new session, so history is restored
    modelKey: currentModel
      ? `${currentModel.uri}|${currentModel.contextSize ?? "auto"}`
      : undefined,
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
          models={installedModels}
          currentModelId={currentModelId}
          isModelLoading={isLoading}
          isModelLoaded={isModelLoaded}
          onModelSelect={handleModelSelect}
        />
      }
    >
      {activeView === "library" && (
        <ModelLibraryPage
          currentModelId={currentModelId}
          isModelLoaded={isModelLoaded}
          isModelLoading={isLoading}
          onLoadModel={handleModelSelect}
          onInstalledChange={refreshInstalledModels}
        />
      )}
      {activeView === "plugins" && (
        <PluginsPage currentModel={currentModelConfig} />
      )}
      <div
        className={
          activeView === "chat" || activeView === "code"
            ? "flex h-full flex-col"
            : "hidden"
        }
      >
        <ChatHeader
          modelName={currentModel?.name}
          isLoading={isLoading || isLoadingModels}
          error={error}
          warning={warning}
          availableModels={installedModels}
          currentModelId={currentModelId}
          onClearHistory={handleClearHistory}
        />
        {messages.length === 0 && !streamingContent ? (
          <ChatPlaceholder
            modelLoaded={isModelLoaded}
            isLoading={isLoading}
            selectedModelName={
              currentModelConfig && isRuntimeAvailable(currentModelConfig)
                ? currentModelConfig.displayName
                : undefined
            }
            onLoadSelected={
              currentModelConfig
                ? () => handleModelSelect(currentModelConfig)
                : undefined
            }
            onOpenLibrary={() => setActiveView("library")}
            onPromptClick={handleSendMessage}
          />
        ) : (
          <MessageList
            messages={messages}
            streamingContent={streamingContent}
            isGenerating={isGenerating}
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

      <LowMemoryDialog
        prompt={memoryPrompt}
        onContinue={confirmLowMemory}
        onCancel={cancelLowMemory}
      />
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
