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
import type { ModelOption } from "./components/chat/ModelSelector";
import "./App.css";

// Available models for selection
const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "qwen-7b",
    name: "Qwen2.5-7B-Instruct",
    displayName: "Qwen 7B",
    uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
    size: "4.2GB",
    description: "Excellent multilingual understanding, balanced performance",
    contextSize: 2048,
  },
  {
    id: "llama-3b",
    name: "Llama-3.2-3B-Instruct",
    displayName: "Llama 3B",
    uri: "hf:meta-llama/Llama-3.2-3B-Instruct-GGUF:Q4_K_M",
    size: "1.9GB",
    description: "Faster responses, smaller model, good for quick tasks",
    contextSize: 2048,
  },
  {
    id: "mistral-7b",
    name: "Mistral-7B-Instruct",
    displayName: "Mistral 7B",
    uri: "hf:mistralai/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M",
    size: "4.1GB",
    description: "Strong reasoning capabilities, alternative to Qwen",
    contextSize: 2048,
  },
];

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

  // Sync messages with current conversation
  useEffect(() => {
    if (currentConversation) {
      setMessages(currentConversation.messages);
    }
  }, [currentConversation]);

  // Restore chat history when conversation changes (for LLM memory)
  useEffect(() => {
    if (
      currentConversation &&
      currentConversation.messages.length > 0 &&
      isModelLoaded
    ) {
      console.log(
        "[App] Restoring chat history for conversation:",
        currentConversation.id
      );
      setChatHistory(currentConversation.messages).catch((err) => {
        console.error("[App] Failed to restore chat history:", err);
      });
    } else if (
      currentConversation &&
      currentConversation.messages.length === 0 &&
      isModelLoaded
    ) {
      // New conversation - clear history
      console.log("[App] New conversation - clearing history");
      clearHistory().catch((err) => {
        console.error("[App] Failed to clear history:", err);
      });
    }
  }, [currentConversation, isModelLoaded, setChatHistory, clearHistory]);

  // Auto-load model ONLY when initialized and user hasn't loaded one yet
  // This happens in the background without blocking the UI
  useEffect(() => {
    if (isInitialized && !isModelLoaded && !isLoading && !currentModel) {
      console.log("[App] Auto-loading default model...");
      const defaultModel = AVAILABLE_MODELS.find(
        (m) => m.id === currentModelId
      );
      if (defaultModel) {
        // Non-blocking load - UI stays responsive
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

  const handleSendMessage = async (content: string) => {
    if (!isModelLoaded) {
      alert("Please wait for the model to load");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    addMessage(userMessage); // Add to conversation store
    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    const assistantMessageId = (Date.now() + 1).toString();

    try {
      await sendStreamingMessage(
        content,
        (token) => {
          streamingContentRef.current += token;
          setStreamingContent(streamingContentRef.current);
        },
        {
          temperature: 0.7,
          maxTokens: 512,
        }
      );

      // Finalize the message using the ref which has the complete content
      const finalContent = streamingContentRef.current;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: finalContent,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      addMessage(assistantMessage); // Add to conversation store
      setStreamingContent("");
      streamingContentRef.current = "";

      // Generate title for first message in conversation
      if (currentConversation && currentConversation.messages.length === 0) {
        console.log("[App] Generating title for new conversation");
        const generatedTitle = await generateTitle(content);
        if (generatedTitle) {
          console.log("[App] Setting conversation title:", generatedTitle);
          updateTitle(generatedTitle);
        }
      }

      // Auto-save conversation after each exchange
      await saveCurrentConversation();
    } catch (err) {
      // Check if the error is due to user cancellation (abort)
      const isAbortError =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("abort"));

      if (isAbortError) {
        // User cancelled - save partial response if any
        if (streamingContentRef.current) {
          const assistantMessage: Message = {
            id: assistantMessageId,
            role: "assistant",
            content: streamingContentRef.current,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          addMessage(assistantMessage); // Add to conversation store
          await saveCurrentConversation(); // Save partial conversation
        }
        setStreamingContent("");
        streamingContentRef.current = "";
      } else {
        // Actual error - log it but don't show error message to user
        console.error("Error generating response:", err);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStopGenerating = async () => {
    try {
      await stopGeneration();
      setIsGenerating(false);

      // Finalize with whatever content we have so far
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
    // Save current conversation before creating new one
    if (currentConversation && currentConversation.messages.length > 0) {
      saveCurrentConversation();
    }
    // Create new conversation
    createNewConversation("New Chat", currentModelId);
    // Clear UI messages
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
