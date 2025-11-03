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
import { createContinuationHandler } from "./handlers/continuationHandler";
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

  const handleContinue = createContinuationHandler({
    messages,
    setMessages,
    setIsGenerating,
    setStreamingContent,
    streamingContentRef,
    sendStreamingMessage,
    addMessage,
    saveCurrentConversation,
    modelSettings: settings.model,
  });

  const handleEditMessage = async (messageId: string, newContent: string) => {
    // Find the message index
    const messageIndex = messages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1) return;

    const originalMessage = messages[messageIndex];
    if (!originalMessage) return;

    // Update the message content
    const updatedMessages = messages.slice(0, messageIndex);
    const editedMessage: Message = {
      id: originalMessage.id,
      role: originalMessage.role,
      content: newContent,
      timestamp: originalMessage.timestamp,
    };
    updatedMessages.push(editedMessage);

    // Update state to show only messages up to and including the edited one
    setMessages(updatedMessages);
    
    // Update llama chat history with the new message set
    await setChatHistory(updatedMessages);

    // Regenerate response from the edited message
    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    try {
      await sendStreamingMessage(
        newContent,
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
      const finalMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, finalMessage]);
      addMessage(finalMessage);
      setStreamingContent("");
      streamingContentRef.current = "";
      setIsGenerating(false);
      saveCurrentConversation();
    } catch (error) {
      console.error("Error regenerating response:", error);
      setIsGenerating(false);
      setStreamingContent("");
      streamingContentRef.current = "";
    }
  };

  const handleRegenerateMessage = async (messageId: string) => {
    // Find the assistant message and the user message before it
    const messageIndex = messages.findIndex((msg) => msg.id === messageId);
    if (messageIndex === -1 || messageIndex === 0) return;

    const assistantMessage = messages[messageIndex];
    if (!assistantMessage || assistantMessage.role !== "assistant") return;

    // Find the user message that prompted this response
    const userMessage = messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== "user") return;

    // Remove the assistant message and everything after it
    const updatedMessages = messages.slice(0, messageIndex);
    setMessages(updatedMessages);
    
    // Update llama chat history
    await setChatHistory(updatedMessages);

    // Regenerate the response
    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    try {
      await sendStreamingMessage(
        userMessage.content,
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
      const finalMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, finalMessage]);
      addMessage(finalMessage);
      setStreamingContent("");
      streamingContentRef.current = "";
      setIsGenerating(false);
      saveCurrentConversation();
    } catch (error) {
      console.error("Error regenerating response:", error);
      setIsGenerating(false);
      setStreamingContent("");
      streamingContentRef.current = "";
    }
  };

  return (
    <ChatLayout
      sidebar={
        <Sidebar
          onNewChat={handleNewChat}
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

      <SettingsDialog 
        open={settingsOpen} 
        onOpenChange={setSettingsOpen}
        onApplySystemPrompt={setSystemPrompt}
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
