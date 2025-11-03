"use client";

import { useRef, useEffect } from "react";
import { ChatMessage } from "./ChatMessage";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  truncated?: boolean;
}

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  isGenerating?: boolean;
  onContinue?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
}

export function MessageList({
  messages,
  streamingContent,
  isGenerating,
  onContinue,
  onEditMessage,
  onRegenerateMessage,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            truncated={message.truncated}
            onContinue={
              message.truncated ? () => onContinue?.(message.id) : undefined
            }
            onEdit={
              message.role === "user" && onEditMessage
                ? (newContent) => onEditMessage(message.id, newContent)
                : undefined
            }
            onRegenerate={
              message.role === "assistant" && onRegenerateMessage
                ? () => onRegenerateMessage(message.id)
                : undefined
            }
          />
        ))}
        {streamingContent && (
          <ChatMessage
            role="assistant"
            content={streamingContent}
            isStreaming={isGenerating}
          />
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
