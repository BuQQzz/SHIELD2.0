"use client";

import { WritingIndicator } from "./WritingIndicator";
import { useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { ChatMessage } from "./ChatMessage";
import { AssistantTurn } from "./AssistantTurn";
import { groupIntoTurns } from "./turns";
import type { Message } from "@/types/conversation";

/** Within this distance of the bottom counts as at the bottom */
const BOTTOM_PX = 48;

interface MessageListProps {
  messages: Message[];
  streamingContent?: string;
  isGenerating?: boolean;
  onContinue?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRegenerateMessage?: (messageId: string) => void;
  /** A tool call currently executing, shown at the end of the thread */
  runningTool?: { tool: string; serverName: string; target?: string } | null;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  /**
   * Whether the view follows the conversation to the bottom. Scrolling up
   * lets go - it used to snap back down after every tool round and every
   * finished reply, so nothing further up could be read while SHIELD
   * worked. Coming back to the bottom, sending a message or opening
   * another chat takes hold again.
   */
  const followRef = useRef(true);

  const scrollToBottom = () => {
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  };

  const onScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distance =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // Following scrolls only ever go down to the bottom, so a position
    // away from it is the user's doing (scrollbar, keys, touch)
    followRef.current = distance <= BOTTOM_PX;
  };

  // A wheel turned up lets go at once, before any scroll lands
  const onWheel = (event: React.WheelEvent) => {
    if (event.deltaY < 0) followRef.current = false;
  };

  // Sending a message, or opening another chat, jumps to the bottom
  const lastMessage = messages.at(-1);
  const sentByUser =
    lastMessage?.role === "user" && !lastMessage.toolResult
      ? lastMessage.id
      : undefined;
  const chatStart = messages[0]?.id;
  useLayoutEffect(() => {
    followRef.current = true;
    scrollToBottom();
  }, [sentByUser, chatStart]);

  // Anything that makes the conversation taller - streamed tokens, steps,
  // a step opened, markdown settling - is followed while holding on
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (followRef.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const turns = useMemo(() => groupIntoTurns(messages), [messages]);

  // A reply is keyed by the message it answers, so it stays mounted - and
  // does not replay its entrance - as its first streamed message is saved
  const replyKey = (index: number) => {
    const asked = turns[index - 1];
    return `reply-${asked?.kind === "user" ? asked.message.id : "start"}`;
  };

  const live = Boolean(isGenerating || streamingContent || runningTool);
  // What the reply in progress is doing: its latest group shows it
  const liveWork = live
    ? {
        runningTool,
        busy: Boolean(isGenerating && !streamingContent && !runningTool),
      }
    : null;

  // The text being written, at the end of the reply's block
  const streaming = streamingContent ? (
    <>
      <ChatMessage
        variant="part"
        role="assistant"
        content={streamingContent}
        isStreaming={isGenerating}
      />
      {isGenerating && <WritingIndicator />}
    </>
  ) : null;

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      onWheel={onWheel}
      className="flex-1 overflow-y-auto p-4"
    >
      <div ref={contentRef} className="mx-auto max-w-4xl space-y-4">
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
              live={isLastTurn ? liveWork : null}
              onContinue={onContinue}
              onRegenerate={
                onRegenerateMessage
                  ? () => onRegenerateMessage(turn.id)
                  : undefined
              }
            >
              {live && isLastTurn && streaming}
            </AssistantTurn>
          );
        })}
        {live && turns.at(-1)?.kind !== "assistant" && (
          <AssistantTurn
            key={replyKey(turns.length)}
            messages={[]}
            parts={[]}
            isLive
            live={liveWork}
          >
            {streaming}
          </AssistantTurn>
        )}
      </div>
    </div>
  );
}
