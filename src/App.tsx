"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { ChatLayout } from "./components/chat/ChatLayout";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatPlaceholder } from "./components/chat/ChatPlaceholder";
import { MessageList } from "./components/chat/MessageList";
import { ChatInput, type ChatInputRef } from "./components/chat/ChatInput";
import { LazySettingsDialog, LazyTemplateSelector } from "./components/lazy";
import { PermissionDialog, type PermissionRequest } from "./components/dialogs/PermissionDialog";
import { WriteFileDialog, type WriteFileRequest } from "./components/dialogs/WriteFileDialog";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { useLlama, type Message } from "./hooks/useLlama";
import { useConversationStore } from "./stores/conversation-store";
import { useConversationSync } from "./hooks/useConversationSync";
import { useSettingsStore } from "./store/settingsStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWebSearch } from "./hooks/useWebSearch";
import { useAppHandlers } from "./hooks/useAppHandlers";
import { useModelLoader } from "./hooks/useModelLoader";
import { useMCP } from "./hooks/useMCP";
import { createAppShortcuts } from "./config/shortcuts";
import { AVAILABLE_MODELS } from "./config/models";
import { getMCPSystemPrompt } from "./handlers/mcpToolHandler";
import type { ToolCallRequest } from "./handlers/mcpToolHandler";
import type { MCPToolResult } from "./types/electron";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentModelId, setCurrentModelId] = useState<string>("qwen-7b");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [isWebSearching, setIsWebSearching] = useState(false);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [writeFileRequest, setWriteFileRequest] = useState<WriteFileRequest | null>(null);
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
  const { isReady: isMCPReady, callTool } = useMCP();

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Update system prompt when MCP status changes OR when model loads
  useEffect(() => {
    console.log("[MCP] System prompt effect triggered", {
      isModelLoaded,
      isMCPReady,
      mcpEnabled: settings.mcp?.enabled,
      shouldAddMCP: isMCPReady && settings.mcp?.enabled
    });
    
    // Only set system prompt if model is loaded
    if (!isModelLoaded) {
      console.log("[MCP] ⏳ Model not loaded yet, skipping system prompt update");
      return;
    }
    
    if (isMCPReady && settings.mcp?.enabled) {
      const basePrompt = settings.system.systemPrompt;
      const mcpPrompt = getMCPSystemPrompt();
      const fullPrompt = `${basePrompt}\n\n${mcpPrompt}`;
      console.log("[MCP] ✅ MCP is ready and enabled, adding system prompt");
      console.log("[MCP] Full system prompt length:", fullPrompt.length);
      console.log("[MCP] MCP tools section:", mcpPrompt);
      setSystemPrompt(fullPrompt);
    } else {
      console.log("[MCP] ❌ MCP not ready or not enabled, using base system prompt only");
      console.log("[MCP] - isMCPReady:", isMCPReady);
      console.log("[MCP] - settings.mcp?.enabled:", settings.mcp?.enabled);
      setSystemPrompt(settings.system.systemPrompt);
    }
  }, [isModelLoaded, isMCPReady, settings.mcp?.enabled, settings.system.systemPrompt, setSystemPrompt]);

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
  // MCP tool call handler - shows permission dialog and executes approved tools
  const handleToolCallRequest = async (toolCall: ToolCallRequest): Promise<MCPToolResult> => {
    return new Promise((resolve) => {
      // Check if this is a write_file operation
      if (toolCall.tool === 'write_file') {
        const path = toolCall.arguments.path as string;
        const content = toolCall.arguments.content as string;
        
        // Show WriteFileDialog instead of generic PermissionDialog
        setWriteFileRequest({
          path,
          content,
          fileExists: false, // TODO: Check if file exists via IPC
        });
        
        // Store the resolve function
        window._mcpToolResolve = resolve;
      } else {
        // For read and list operations, use the generic PermissionDialog
        setPermissionRequest({
          serverName: toolCall.serverName,
          toolName: toolCall.tool,
          arguments: toolCall.arguments,
        });
        
        // Store the resolve function
        window._mcpToolResolve = resolve;
      }
    });
  };

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

      <PermissionDialog
        open={!!permissionRequest}
        request={permissionRequest}
        onApprove={async (_remember: boolean) => {
          if (!permissionRequest) return;
          
          try {
            const result = await callTool({
              serverName: permissionRequest.serverName,
              tool: permissionRequest.toolName,
              arguments: permissionRequest.arguments || {},
            });
            
            console.log("[MCP] Tool result:", result);
            
            // Resolve the promise if one is waiting
            if (window._mcpToolResolve) {
              window._mcpToolResolve(result);
              delete window._mcpToolResolve;
            }
          } catch (error) {
            console.error("[MCP] Tool call failed:", error);
            
            // Resolve with error
            if (window._mcpToolResolve) {
              window._mcpToolResolve({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              });
              delete window._mcpToolResolve;
            }
          } finally {
            setPermissionRequest(null);
          }
        }}
        onDeny={() => {
          console.log("[MCP] User denied tool request");
          
          // Resolve with denial
          if (window._mcpToolResolve) {
            window._mcpToolResolve({
              success: false,
              error: "User denied permission",
            });
            delete window._mcpToolResolve;
          }
          
          setPermissionRequest(null);
        }}
      />

      <WriteFileDialog
        open={!!writeFileRequest}
        request={writeFileRequest}
        onApprove={async (_remember: boolean) => {
          if (!writeFileRequest) return;
          
          try {
            const result = await callTool({
              serverName: 'filesystem',
              tool: 'write_file',
              arguments: {
                path: writeFileRequest.path,
                content: writeFileRequest.content,
              },
            });
            
            console.log("[MCP] Write file result:", result);
            
            // Resolve the promise if one is waiting
            if (window._mcpToolResolve) {
              window._mcpToolResolve(result);
              delete window._mcpToolResolve;
            }
          } catch (error) {
            console.error("[MCP] Write file failed:", error);
            
            // Resolve with error
            if (window._mcpToolResolve) {
              window._mcpToolResolve({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              });
              delete window._mcpToolResolve;
            }
          } finally {
            setWriteFileRequest(null);
          }
        }}
        onDeny={() => {
          console.log("[MCP] User denied write file request");
          
          // Resolve with denial
          if (window._mcpToolResolve) {
            window._mcpToolResolve({
              success: false,
              error: "User denied permission",
            });
            delete window._mcpToolResolve;
          }
          
          setWriteFileRequest(null);
        }}
      />
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
