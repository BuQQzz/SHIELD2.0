"use client";

import { useState, useRef, useEffect } from "react";
import { ChatLayout } from "./components/chat/ChatLayout";
import { Sidebar } from "./components/chat/Sidebar";
import { ChatHeader } from "./components/chat/ChatHeader";
import { ChatPlaceholder } from "./components/chat/ChatPlaceholder";
import { MessageList } from "./components/chat/MessageList";
import { ChatInput } from "./components/chat/ChatInput";
import { useLlama, type Message } from "./hooks/useLlama";
import "./App.css";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
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
  } = useLlama();

  // Auto-load model ONLY when initialized and user hasn't loaded one yet
  // This happens in the background without blocking the UI
  useEffect(() => {
    if (isInitialized && !isModelLoaded && !isLoading && !currentModel) {
      console.log("[App] Auto-loading default model...");
      // Non-blocking load - UI stays responsive
      loadModel({
        name: "Qwen2.5-7B-Instruct",
        uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
        contextSize: 2048,
      }).catch(err => {
        console.error("[App] Failed to auto-load model:", err);
      });
    }
  }, [isInitialized, isModelLoaded, isLoading, currentModel, loadModel]);

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
      setStreamingContent("");
      streamingContentRef.current = "";
    } catch (err) {
      console.error("Error generating response:", err);
      const errorMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "Sorry, I encountered an error generating a response.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsGenerating(false);
    setStreamingContent("");
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

  return (
    <ChatLayout sidebar={<Sidebar onClearHistory={handleClearHistory} />}>
      <div className="flex h-full flex-col">
        {/* Debug overlay */}
        {process.env.NODE_ENV === "development" && (
          <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-black/80 p-3 text-xs text-white">
            <div>Init: {isInitialized ? "✅" : "❌"}</div>
            <div>Model Loaded: {isModelLoaded ? "✅" : "❌"}</div>
            <div>Loading: {isLoading ? "⏳" : "✅"}</div>
            <div>Error: {error || "None"}</div>
            <div>window.llama: {typeof window.llama !== "undefined" ? "✅" : "❌"}</div>
          </div>
        )}
        
        <ChatHeader
          modelName={currentModel?.name}
          isLoading={isLoading}
          error={error}
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

