"use client";

import { ReadingIndicator } from "./ReadingIndicator";
import { useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { ToolResultMessage } from "./ToolResultMessage";
import { ToolRunningRow } from "./ToolRunningRow";
import { SearchingIndicator } from "./SearchingIndicator";
import { AnimatePresence } from "framer-motion";
import type { Message } from "@/types/conversation";

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  isGenerating?: boolean;
  isSearching?: boolean;
  onContinue?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  /** A tool call currently executing, shown at the end of the thread */
  runningTool?: { tool: string; serverName: string } | null;
}

export function MessageList({
  messages,
  streamingContent,
  isGenerating,
  isSearching,
  onContinue,
  onEditMessage,
  onRegenerateMessage,
  runningTool,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  // Smooth scroll to bottom using requestAnimationFrame
  const scrollToBottom = useCallback((instant = false) => {
    const container = scrollContainerRef.current;
    const endElement = messagesEndRef.current;

    if (!container || !endElement) return;

    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const targetScroll = endElement.offsetTop;
    const currentScroll = container.scrollTop;
    const distance = targetScroll - currentScroll;

    // If instant or very close, just set it
    if (instant || Math.abs(distance) < 10) {
      container.scrollTop = targetScroll;
      isAutoScrollingRef.current = false;
      return;
    }

    // Smooth scroll using easing
    const duration = 150; // ms
    const startTime = performance.now();
    isAutoScrollingRef.current = true;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic for smooth deceleration
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      container.scrollTop = currentScroll + distance * easeProgress;

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        isAutoScrollingRef.current = false;
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);
  }, []);

  // Auto-scroll when streaming (smooth, non-blocking)
  useEffect(() => {
    if (isGenerating && streamingContent) {
      // Use requestAnimationFrame for smooth, efficient scrolling
      const container = scrollContainerRef.current;
      const endElement = messagesEndRef.current;

      if (!container || !endElement) return;

      // Only auto-scroll if user is near the bottom (within 150px)
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        150;

      if (isNearBottom) {
        // Use requestAnimationFrame for smooth scroll during streaming
        requestAnimationFrame(() => {
          if (container && endElement) {
            container.scrollTop = container.scrollHeight;
          }
        });
      }
    }
  }, [streamingContent, isGenerating]);

  // Smooth scroll when messages change (not during streaming)
  useEffect(() => {
    if (!isGenerating) {
      scrollToBottom(false);
    }
  }, [messages, isGenerating, scrollToBottom]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        {messages.map((message) =>
          message.toolResult ? (
            <ToolResultMessage
              key={message.id}
              tool={message.toolResult.tool}
              serverName={message.toolResult.serverName}
              success={message.toolResult.success}
              blocked={message.toolResult.blocked}
              content={message.content}
            />
          ) : (
            <ChatMessage
              key={message.id}
              role={message.role}
              content={message.content}
              truncated={message.truncated}
              sources={message.sources}
              thinking={message.thinking}
              isThinking={message.isThinking}
              stats={message.stats}
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
          )
        )}
        <AnimatePresence mode="wait">
          {runningTool && (
            <ToolRunningRow
              key={`${runningTool.serverName}.${runningTool.tool}`}
              tool={runningTool.tool}
              serverName={runningTool.serverName}
            />
          )}
        </AnimatePresence>
        {isSearching && (
          <AnimatePresence>
            <SearchingIndicator />
          </AnimatePresence>
        )}
        {isGenerating && !streamingContent && !runningTool && !isSearching && (
          <ReadingIndicator />
        )}
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
