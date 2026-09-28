"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  Suspense,
} from "react";
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
import { useProjectStore } from "./stores/project-store";
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
import { useRecommendedSampling } from "./hooks/useRecommendedSampling";
import { effectiveSampling } from "./services/modelSampling";
import { sameFolder, useApplyWorkspace } from "./hooks/useApplyWorkspace";
import { kindOf, ofKind, viewKind } from "./lib/sessions";
import { CodeModelHint } from "./components/chat/CodeModelHint";
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
    conversations,
    createNewConversation,
    loadConversation,
    updateConversation,
    addMessage,
    updateTitle,
    saveCurrentConversation,
  } = useConversationStore();

  // Chat is plain conversation; Code is a session on a project folder with
  // the file tools. What the model is offered follows the open conversation,
  // so a look at the library mid-session changes nothing.
  const isCodeSession = kindOf(currentConversation) === "code";

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
    fileTools: isCodeSession,
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
    // A chat without web search has no tools at all
    mcpEnabled: isCodeSession || toolPolicy.advertisedTools.length > 0,
    baseSystemPrompt: settings.system.systemPrompt,
    setSystemPrompt,
    modelName: currentModelConfig?.name,
    modelCapabilities: currentModelConfig?.capabilities,
    availableTools: toolPolicy.advertisedTools,
    allowedPaths: isCodeSession ? mcpAllowedPaths : [],
    planOnly: toolPolicy.isPlanning,
    toolsLoading: !mcpToolsSettled,
  });

  // Initialize a new conversation if none exists
  useEffect(() => {
    if (!currentConversation) {
      createNewConversation("New Chat", currentModelId);
    }
  }, [currentConversation, createNewConversation, currentModelId]);

  // Each view shows its own kind of session: opening Chat or Code goes to
  // that kind's latest conversation, or starts one
  const activeKind = viewKind(activeView);
  useEffect(() => {
    if (!activeKind || !currentConversation) return;
    if (kindOf(currentConversation) === activeKind) return;
    const latest = ofKind(conversations, activeKind)[0];
    if (latest) {
      void loadConversation(latest.id);
    } else {
      createNewConversation(
        activeKind === "code" ? "New session" : "New Chat",
        currentModelId,
        { kind: activeKind }
      );
    }
  }, [
    activeKind,
    currentConversation,
    conversations,
    loadConversation,
    createNewConversation,
    currentModelId,
  ]);

  // A Code session's file tools work in its project folder
  const applyWorkspace = useApplyWorkspace();
  const sessionFolder = isCodeSession ? currentConversation?.folder : undefined;
  useEffect(() => {
    if (!sessionFolder) return;
    if (sameFolder(sessionFolder, settings.mcp?.workspaceFolder)) return;
    void applyWorkspace(sessionFolder);
  }, [sessionFolder, settings.mcp?.workspaceFolder, applyWorkspace]);
  // Nothing is sent from a Code session until its folder is in effect: the
  // file server restarts on a switch, and a message in that second would
  // have run tools in the previous session's folder
  const folderReady =
    !isCodeSession ||
    (!!sessionFolder &&
      sameFolder(sessionFolder, settings.mcp?.workspaceFolder));

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

  // The loaded model's own sampling, unless the user turned that off:
  // SHIELD's one global setting did not suit every model (2026-09-26)
  const recommendedSampling = useRecommendedSampling(
    isModelLoaded ? currentModelId : null
  );
  // Tool calls copy paths exactly: a recommended temperature is capped then
  const toolsAvailable =
    settings.mcp.enabled && isMCPReady && toolPolicy.advertisedTools.length > 0;
  const modelSettings = useMemo(
    () =>
      settings.model.useModelSampling === false
        ? settings.model
        : {
            ...settings.model,
            ...effectiveSampling(settings.model, recommendedSampling, {
              toolsAvailable,
            }),
          },
    [settings.model, recommendedSampling, toolsAvailable]
  );

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
    handleToolCallRequest, // Pass MCP handler
    isMCPReady,
  });

  // A new Code session starts in a folder the user picks - or in its
  // project's folder, without asking; a project without one takes the
  // folder picked for its first session
  const handleNewSession = useCallback(
    async (projectId?: string) => {
      const project = projectId
        ? useProjectStore.getState().projects.find((p) => p.id === projectId)
        : undefined;
      const folder =
        project?.folder ?? (await window.electronAPI.mcp.chooseWorkspace());
      if (!folder) return;
      if (project && !project.folder) {
        await useProjectStore.getState().updateProject(project.id, { folder });
      }
      if (currentConversation?.messages.length) await saveCurrentConversation();
      // The new session first; the effect above then applies its folder.
      // Applied here first, while the previous session was still open, the
      // effect switched back to that session's folder and then forward
      // again: two file-server restarts, and a tool list read in between
      // with no file tools (2026-09-28).
      createNewConversation("New session", currentModelId, {
        kind: "code",
        folder,
        projectId: project?.id,
      });
      setMessages([]);
      await clearHistory();
    },
    [
      currentConversation,
      saveCurrentConversation,
      createNewConversation,
      currentModelId,
      clearHistory,
    ]
  );

  // A Code session opened from the view itself has no folder yet
  const handleChooseSessionFolder = useCallback(async () => {
    const picked = await window.electronAPI.mcp.chooseWorkspace();
    if (!picked) return;
    const folder = await applyWorkspace(picked);
    if (folder) updateConversation({ folder });
  }, [applyWorkspace, updateConversation]);

  const handleNew = useCallback(
    (kind = activeKind ?? kindOf(currentConversation), projectId?: string) => {
      if (kind === "code") void handleNewSession(projectId);
      else handleNewChat(projectId);
    },
    [activeKind, currentConversation, handleNewSession, handleNewChat]
  );

  // Keyboard shortcuts
  useKeyboardShortcuts(
    createAppShortcuts(
      isGenerating,
      settingsOpen,
      () => handleNew(),
      handleStopGenerating,
      () => inputRef.current?.focus(),
      setSettingsOpen
    )
  );

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          onNewChat={handleNew}
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
            onPromptClick={folderReady ? handleSendMessage : undefined}
            code={
              isCodeSession
                ? {
                    folder: currentConversation?.folder,
                    onChooseFolder: handleChooseSessionFolder,
                  }
                : undefined
            }
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
        {isCodeSession && isModelLoaded && (
          <CodeModelHint
            currentModelId={currentModelId}
            models={installedModels}
            onLoad={handleModelSelect}
          />
        )}
        <ChatInput
          ref={inputRef}
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          onStop={handleStopGenerating}
          disabled={!isModelLoaded || !folderReady}
          showFolder={isCodeSession}
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
