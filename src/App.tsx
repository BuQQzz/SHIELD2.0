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
import { StuckBar } from "./components/chat/StuckBar";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { toast } from "sonner";
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
import { useAgentTeam } from "./hooks/useAgentTeam";
import { TeamPanel } from "./components/team/TeamPanel";
import { useTeamStore } from "./stores/team-store";
import { useGenerationStore } from "./store/generationStore";
import { sendWhatWaits } from "./handlers/steer";
import { generateMessageId } from "./handlers/messageHandler";
import { restoreRuns } from "./agents/runView";
import { ORCHESTRATOR_PROMPT } from "./agents/roles";
import { teamFor } from "./agents/team";
import { useInstalledModels } from "./hooks/useInstalledModels";
import { useRecommendedSampling } from "./hooks/useRecommendedSampling";
import { effectiveSampling } from "./services/modelSampling";
import { sameFolder, useApplyWorkspace } from "./hooks/useApplyWorkspace";
import { kindOf, ofKind, viewKind } from "./lib/sessions";
import { CodeModelHint } from "./components/chat/CodeModelHint";
import { AgentsMdHint } from "./components/chat/AgentsMdHint";
import { PlanPanel } from "./components/chat/PlanPanel";
import { editPlan } from "./handlers/sessionPlan";
import { useInstructionsStore } from "./stores/instructions-store";
import { DRAFT_REQUEST, draftNote } from "./config/agentsMd";
import { useChatStore } from "./stores/chat-store";
import { ModelLibraryPage } from "./components/library/ModelLibraryPage";
import { PluginsPage } from "./components/plugins/PluginsPage";
import { LowMemoryDialog } from "./components/models/LowMemoryDialog";
import { DEFAULT_MODEL_ID, isRuntimeAvailable } from "./config/models";
import { createAppShortcuts } from "./config/shortcuts";
import { shouldTurnTeamOff, teamAvailability } from "./agents/teamFit";
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
  // A Code session can be led by an orchestrator that delegates (Team): it
  // is offered delegate and the plan only, and its sub-agents work under the
  // session's normal policy.
  const teamFit = teamAvailability(
    installedModels.find((m) => m.id === currentModelId)
  );
  // Team on, but the model in use should not run it: it goes off, with a
  // note, and the toggle explains how to turn it on anyway
  const teamMustGoOff = shouldTurnTeamOff(
    currentConversation,
    currentModelId,
    teamFit
  );
  const teamMode =
    isCodeSession && !!currentConversation?.team && !teamMustGoOff;
  useEffect(() => {
    if (!teamMustGoOff) return;
    updateConversation({ team: false });
    toast(
      "Team turned off: this model is not suited to leading a team. You can turn it on anyway from the Team button."
    );
  }, [teamMustGoOff, updateConversation]);
  const policyInput = {
    mode: settings.mcp?.mode ?? "ask",
    allowedTools: settings.mcp?.allowedTools ?? [],
    serverTools: mcpServerTools,
    webSearchEnabled: settings.webSearch?.enabled ?? false,
    fileTools: isCodeSession,
  };
  const workerPolicy = useToolPolicy(policyInput);
  const toolPolicy = useToolPolicy({ ...policyInput, teamMode });

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
  // The open code session's AGENTS.md, read into its prompt
  const projectInstructions = useInstructionsStore((state) => state.text);
  // Real tool list from the connected MCP servers
  useMCPSystemPrompt({
    isModelLoaded,
    isMCPReady,
    // A chat without web search has no tools at all
    mcpEnabled: isCodeSession || toolPolicy.advertisedTools.length > 0,
    baseSystemPrompt: teamMode
      ? ORCHESTRATOR_PROMPT
      : settings.system.systemPrompt,
    setSystemPrompt,
    modelName: currentModelConfig?.name,
    modelCapabilities: currentModelConfig?.capabilities,
    availableTools: toolPolicy.advertisedTools,
    allowedPaths: isCodeSession && !teamMode ? mcpAllowedPaths : [],
    planOnly: toolPolicy.isPlanning,
    toolsLoading: !mcpToolsSettled,
    projectInstructions: isCodeSession ? projectInstructions : "",
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

  // Its AGENTS.md: read when the folder is in effect, and again after each
  // message, so one the model just wrote is picked up
  const messageCount = currentConversation?.messages.length ?? 0;
  const instructions = useInstructionsStore();
  useEffect(() => {
    void useInstructionsStore
      .getState()
      .load(folderReady ? sessionFolder : undefined);
  }, [sessionFolder, folderReady, messageCount]);

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

  // The orchestrator's delegate calls run sub-agents; every other call goes
  // to the usual handler
  const { handleToolCall, activity: teamActivity } = useAgentTeam({
    conversationId: currentConversation?.id,
    handleToolCallRequest,
    workerPolicy,
    allowedPaths: mcpAllowedPaths,
    workspaceFolder: settings.mcp?.workspaceFolder,
    modelName: currentModelConfig?.name,
    sampling: modelSettings,
  });

  // App handlers hook
  const {
    handleSendMessage: sendMessage,
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
    handleToolCallRequest: handleToolCall, // Pass MCP handler
    isMCPReady,
  });

  // Opening a session brings back what its agents did (Team panel)
  const openConversationId = currentConversation?.id;
  const savedRuns = currentConversation?.agentRuns;
  useEffect(() => {
    if (openConversationId && savedRuns?.length) {
      useTeamStore
        .getState()
        .hydrate(openConversationId, restoreRuns(savedRuns));
    }
  }, [openConversationId, savedRuns]);

  // The latest of each, for a turn that outlives the render it began in
  const sendRef = useRef(sendMessage);
  sendRef.current = sendMessage;
  const isGeneratingRef = useRef(isGenerating);
  isGeneratingRef.current = isGenerating;
  const conversationIdRef = useRef(currentConversation?.id);
  conversationIdRef.current = currentConversation?.id;

  // A new user message lets the orchestrator delegate again
  const beginTurn = useCallback(() => {
    if (!currentConversation) return;
    teamFor(currentConversation.id).beginTurn();
    useTeamStore.getState().beginTurn(currentConversation.id);
  }, [currentConversation]);

  // What was sent or queued during a turn, once it ends - whichever handler
  // ran it: Continue and Regenerate mark the chat busy too
  const afterTurn = useCallback(
    (conversationId: string | undefined) => {
      const generation = useGenerationStore.getState;
      return sendWhatWaits({
        canGoOn: () =>
          !generation().stopRequested &&
          conversationIdRef.current === conversationId,
        takeSteer: () => generation().takeSteer(),
        nextQueued: () => generation().nextQueued(),
        takeQueue: () => generation().takeQueue(),
        send: async (content, options) => {
          beginTurn();
          await sendRef.current(content, options);
        },
        restore: (text) => inputRef.current?.restore(text),
      });
    },
    [beginTurn]
  );

  const handleSendMessage = useCallback(
    async (...args: Parameters<typeof sendMessage>) => {
      const [content] = args;
      // A turn is running: the message steers it, taken with the next tool
      // result (handlers/steer.ts)
      if (isGeneratingRef.current) {
        const message: Message = {
          id: generateMessageId(),
          role: "user",
          content,
          timestamp: new Date(),
          steer: true,
        };
        setMessages((prev) => [...prev, message]);
        addMessage(message);
        useGenerationStore.getState().addSteer(content);
        return;
      }
      beginTurn();
      await sendRef.current(...args);
      await afterTurn(currentConversation?.id);
    },
    [currentConversation, setMessages, addMessage, beginTurn, afterTurn]
  );

  const handleContinueTurn = useCallback(
    async (messageId: string) => {
      await handleContinue(messageId);
      await afterTurn(currentConversation?.id);
    },
    [handleContinue, afterTurn, currentConversation]
  );
  const handleEditTurn = useCallback(
    async (...args: Parameters<typeof handleEditMessage>) => {
      await handleEditMessage(...args);
      await afterTurn(currentConversation?.id);
    },
    [handleEditMessage, afterTurn, currentConversation]
  );
  const handleRegenerateTurn = useCallback(
    async (...args: Parameters<typeof handleRegenerateMessage>) => {
      await handleRegenerateMessage(...args);
      await afterTurn(currentConversation?.id);
    },
    [handleRegenerateMessage, afterTurn, currentConversation]
  );

  // Held for its own turn once the running one ends (handleSendMessage)
  const handleQueueMessage = useCallback(
    (content: string) => {
      if (isGeneratingRef.current) {
        useGenerationStore.getState().addQueued(content);
      } else {
        void handleSendMessage(content);
      }
    },
    [handleSendMessage]
  );

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

  // "Draft one": the model writes AGENTS.md from facts SHIELD gathered;
  // the facts go to the model only, the chat shows the short request
  const handleDraftAgentsMd = useCallback(async () => {
    if (!sessionFolder) return;
    const facts = await window.conversations.projectFacts(sessionFolder);
    await handleSendMessage(DRAFT_REQUEST, { modelNote: draftNote(facts) });
  }, [sessionFolder, handleSendMessage]);

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
            ? "flex h-full"
            : "hidden"
        }
      >
        <div className="flex h-full min-w-0 flex-1 flex-col">
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
              onContinue={handleContinueTurn}
              onEditMessage={handleEditTurn}
              onRegenerateMessage={handleRegenerateTurn}
              runningTool={
                runningTool ??
                (teamActivity
                  ? {
                      tool: "delegate",
                      serverName: "agents",
                      target: teamActivity,
                    }
                  : null)
              }
            />
          )}
          {isCodeSession && currentConversation?.plan && (
            <PlanPanel
              plan={currentConversation.plan}
              onChange={(steps) => void editPlan(steps)}
            />
          )}
          <ToolPermissionBar
            request={pendingRequest}
            onApprove={handleApprove}
            onDeny={handleDeny}
          />
          <StuckBar isGenerating={isGenerating} />
          {isCodeSession &&
            isModelLoaded &&
            folderReady &&
            sessionFolder &&
            !isGenerating &&
            instructions.loaded &&
            sameFolder(instructions.folder ?? undefined, sessionFolder) &&
            instructions.files.length === 0 && (
              <AgentsMdHint
                key={sessionFolder}
                folder={sessionFolder}
                onDraft={() => void handleDraftAgentsMd()}
              />
            )}
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
            onQueue={handleQueueMessage}
            isGenerating={isGenerating}
            onStop={handleStopGenerating}
            disabled={!isModelLoaded || !folderReady}
            showFolder={isCodeSession}
            teamAvailability={teamFit}
            modelId={currentModelId}
            modelName={currentModelConfig?.displayName}
          />
        </div>
        {isCodeSession && (
          <TeamPanel
            conversationId={currentConversation?.id}
            teamMode={teamMode}
          />
        )}
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
