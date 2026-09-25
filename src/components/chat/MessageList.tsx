"use client";

import { ReadingIndicator } from "./ReadingIndicator";
import { WritingIndicator } from "./WritingIndicator";
import { useRef, useEffect, useCallback, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { AssistantTurn } from "./AssistantTurn";
import { ToolStep } from "./ToolStep";
import { groupIntoTurns } from "./turns";
import type { Message } from "@/types/conversation";

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  isGenerating?: boolean;
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

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  // A reply is keyed by the message it answers, so it stays mounted - and
  // does not replay its entrance - as its first streamed message is saved
  const replyKey = (index: number) => {
    const asked = turns[index - 1];
    return `reply-${asked?.kind === "user" ? asked.message.id : "start"}`;
  };

  const live = Boolean(isGenerating || streamingContent || runningTool);

  // What the reply in progress is doing right now, at the end of its block
  const liveParts = (
    <>
      {runningTool && (
        <ToolStep
          tool={runningTool.tool}
          serverName={runningTool.serverName}
          running
        />
      )}
      {isGenerating && !streamingContent && !runningTool && (
        <ReadingIndicator />
      )}
      {streamingContent && (
        <ChatMessage
          variant="part"
          role="assistant"
          content={streamingContent}
          isStreaming={isGenerating}
        />
      )}
      {streamingContent && isGenerating && <WritingIndicator />}
    </>
  );

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-4">
        {turns.map((turn, i) => {
          if (turn.kind === "user") {
            const message = turn.message;
            return (
              <ChatMessage
                key={message.id}
                role="user"
                content={message.content}
                onEdit={
                  onEditMessage
                    ? (newContent) => onEditMessage(message.id, newContent)
                    : undefined
                }
              />
            );
          }
          const isLastTurn = i === turns.length - 1;
          return (
            <AssistantTurn
              key={replyKey(i)}
              messages={turn.messages}
              parts={turn.parts}
              isLive={live && isLastTurn}
              onContinue={onContinue}
              onRegenerate={
                onRegenerateMessage
                  ? () => onRegenerateMessage(turn.id)
                  : undefined
              }
            >
              {live && isLastTurn && liveParts}
            </AssistantTurn>
          );
        })}
        {live && turns.at(-1)?.kind !== "assistant" && (
          <AssistantTurn
            key={replyKey(turns.length)}
            messages={[]}
            parts={[]}
            isLive
          >
            {liveParts}
          </AssistantTurn>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
