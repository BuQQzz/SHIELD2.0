"use client";

import { useState, useRef, useEffect } from "react";
import { ChatLayout } from "./components/chat/ChatLayout";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatPlaceholder } from "./components/chat/ChatPlaceholder";
import { MessageList } from "./components/chat/MessageList";
import { ChatInput, type ChatInputRef } from "./components/chat/ChatInput";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import { ThemeProvider } from "./components/theme/ThemeProvider";
import { useLlama, type Message } from "./hooks/useLlama";
import { useConversationStore } from "./stores/conversation-store";
import { useConversationSync } from "./hooks/useConversationSync";
import { useSettingsStore } from "./store/settingsStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { createMessageHandler } from "./handlers/messageHandler";
import { AVAILABLE_MODELS } from "./config/models";
import type { ModelOption } from "./components/chat/ModelSelector";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [currentModelId, setCurrentModelId] = useState<string>("qwen-7b");
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  } = useLlama();

  const {
    currentConversation,
    createNewConversation,
    addMessage,
    updateTitle,
    saveCurrentConversation,
  } = useConversationStore();

  const { settings, loadSettings } = useSettingsStore();

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "n",
      ctrl: true,
      description: "New conversation",
      callback: () => {
        if (!isGenerating) {
          handleNewChat();
        }
      },
    },
    {
      key: "k",
      ctrl: true,
      description: "Focus input",
      callback: () => {
        inputRef.current?.focus();
      },
    },
    {
      key: ",",
      ctrl: true,
      description: "Open settings",
      callback: () => {
        setSettingsOpen(true);
      },
    },
    {
      key: "Escape",
      description: "Close settings/stop generation",
      callback: () => {
        if (settingsOpen) {
          setSettingsOpen(false);
        } else if (isGenerating) {
          handleStopGenerating();
        }
      },
    },
  ]);

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
    modelSettings: settings.model,
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

  const handleContinue = async (messageId: string) => {
    if (!isModelLoaded) {
      alert("Please wait for the model to load");
      return;
    }

    // Find the truncated message
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;

    // Send a continuation prompt
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: "Continue",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    addMessage(userMessage);
    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = (Date.now() + 1).toString();

    try {
      await sendStreamingMessage(
        "Continue",
        (token) => {
          streamingContentRef.current += token;
          setStreamingContent(streamingContentRef.current);
        },
        {
          temperature: settings.model.temperature,
          maxTokens: settings.model.maxTokens,
          topP: settings.model.topP,
          topK: settings.model.topK,
          repeatPenalty: settings.model.repeatPenalty,
        }
      );

      const finalContent = streamingContentRef.current;
      
      // Detect truncation with same logic as messageHandler
      const estimatedTokens = Math.ceil(finalContent.length / 3.5);
      const tokenLimitReached = estimatedTokens >= settings.model.maxTokens * 0.9;
      const endsWithPunctuation = /[.!?][\s]*$/.test(finalContent.trim());
      const endsWithCodeBlock = /```[\s]*$/.test(finalContent.trim());
      const wasTruncated = tokenLimitReached && (!endsWithPunctuation || endsWithCodeBlock);

      console.log('[Continue] Truncation check:', {
        contentLength: finalContent.length,
        estimatedTokens,
        maxTokens: settings.model.maxTokens,
        tokenLimitReached,
        endsWithPunctuation,
        endsWithCodeBlock,
        wasTruncated
      });

      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: finalContent,
        timestamp: new Date(),
        truncated: wasTruncated,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      addMessage(assistantMessage);
      setStreamingContent("");
      streamingContentRef.current = "";

      await saveCurrentConversation();
    } catch (err) {
      const isAbortError =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("abort"));

      if (isAbortError) {
        if (streamingContentRef.current) {
          const assistantMessage: Message = {
            id: assistantMessageId,
            role: "assistant",
            content: streamingContentRef.current,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          addMessage(assistantMessage);
          await saveCurrentConversation();
        }
        setStreamingContent("");
        streamingContentRef.current = "";
      } else {
        console.error("Error generating continuation:", err);
      }
    } finally {
      setIsGenerating(false);
    }
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
          onOpenSettings={() => setSettingsOpen(true)}
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
            onContinue={handleContinue}
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

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
