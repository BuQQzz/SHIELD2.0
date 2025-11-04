"use client";

import { useRef, useEffect, useCallback } from "react";
import { ChatMessage } from "./ChatMessage";
import { motion } from "framer-motion";
import { Globe, Loader2 } from "lucide-react";
import type { SearchResult } from "@/types/electron";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  truncated?: boolean;
  sources?: SearchResult[];
}

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  isGenerating?: boolean;
  isSearching?: boolean;
  onContinue?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
}

export function MessageList({
  messages,
  streamingContent,
  isGenerating,
  isSearching,
  onContinue,
  onEditMessage,
  onRegenerateMessage,
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
      // Use a lighter approach during streaming to avoid stutter
      const container = scrollContainerRef.current;
      if (!container) return;

      // Only auto-scroll if user is near the bottom (within 100px)
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight <
        100;

      if (isNearBottom) {
        // Instant scroll during streaming for smoothness
        messagesEndRef.current?.scrollIntoView({
          block: "end",
          inline: "nearest",
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
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            truncated={message.truncated}
            sources={message.sources}
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
        {isSearching && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 rounded-lg bg-muted/30"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <Globe className="h-4 w-4 text-primary" />
              </motion.div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Searching the web...</p>
              <p className="text-xs text-muted-foreground">
                Finding the most relevant information
              </p>
            </div>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            </motion.div>
          </motion.div>
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
