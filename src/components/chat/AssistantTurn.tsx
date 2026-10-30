/**
 * Assistant Turn
 *
 * Everything SHIELD did in reply to one user message, under one header: what
 * the model said, and the work it did in between - tool steps, summaries and
 * the short lines on the way - folded into collapsible groups. While a reply
 * is in progress, `live` says what it is doing: shown in the header of the
 * latest group, or as its own line when there is none. The streaming text is
 * passed in as children and appears at the end of the same block.
 */

import { memo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Bot, Check, Copy, RefreshCw, User, Zap } from "lucide-react";
import { formatTokens } from "@/lib/format";
import { ServedBadge } from "./ServedBadge";
import { stripToolCallMarkup } from "@/handlers/mcpToolHandler";
import { ChatMessage } from "./ChatMessage";
import { ReadingIndicator } from "./ReadingIndicator";
import { SummaryStep, ToolStep } from "./ToolStep";
import { WorkGroup, type LiveWork } from "./WorkGroup";
import { turnStats, type TurnPart } from "./turns";
import type { Message } from "@/types/conversation";

interface AssistantTurnProps {
  messages: Message[];
  parts: TurnPart[];
  /** Streaming text */
  children?: ReactNode;
  isLive?: boolean;
  /** What the reply in progress is doing right now */
  live?: LiveWork | null;
  onContinue?: (messageId: string) => void;
  /** Picks up a turn that was paused: given to the latest turn only */
  onResume?: () => void;
  onRegenerate?: () => void;
}

function TextPart({
  message,
  onContinue,
  onResume,
}: {
  message: Message;
  onContinue?: (messageId: string) => void;
  onResume?: () => void;
}) {
  return (
    <ChatMessage
      variant="part"
      role="assistant"
      content={message.content}
      recordNote={message.recordNote}
      sources={message.sources}
      thinking={message.thinking}
      isThinking={message.isThinking}
      onContinue={
        message.truncated
          ? () => onContinue?.(message.id)
          : message.resumable
            ? onResume
            : undefined
      }
    />
  );
}

function Part({
  part,
  live,
  onContinue,
  onResume,
}: {
  part: TurnPart;
  /** Only for the live reply's latest part */
  live?: LiveWork | null;
  onContinue?: (messageId: string) => void;
  onResume?: () => void;
}) {
  if (part.kind === "text") {
    return (
      <TextPart
        message={part.message}
        onContinue={onContinue}
        onResume={onResume}
      />
    );
  }
  if (part.kind === "steer") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
        <User className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <span className="text-xs text-muted-foreground">
            You, while it worked:{" "}
          </span>
          <span className="whitespace-pre-wrap break-words">
            {part.message.content}
          </span>
        </div>
      </div>
    );
  }

  // Finished and on its own, a step needs no group around it
  const only = part.items.length === 1 ? part.items[0]! : null;
  if (!live && only?.kind === "tool") {
    const result = only.message.toolResult!;
    return (
      <ToolStep
        tool={result.tool}
        serverName={result.serverName}
        target={result.target}
        success={result.success}
        blocked={result.blocked}
        content={only.message.content}
      />
    );
  }
  if (!live && only?.kind === "summary") {
    return (
      <SummaryStep id={only.message.id} summary={only.message.summary ?? ""} />
    );
  }
  // Lines on the way to a call that never came back: just text
  if (!live && part.items.every((item) => item.kind === "narration")) {
    return (
      <>
        {part.items.map((item) => (
          <TextPart
            key={item.message.id}
            message={item.message}
            onContinue={onContinue}
            onResume={onResume}
          />
        ))}
      </>
    );
  }
  return <WorkGroup items={part.items} live={live} />;
}

/** Stable while a group grows: keyed by where it starts */
function partKey(part: TurnPart): string {
  if (part.kind === "text" || part.kind === "steer") return part.message.id;
  const first = part.items[0]!;
  return `work-${first.kind}-${first.message.id}`;
}

export const AssistantTurn = memo(function AssistantTurn({
  messages,
  parts,
  children,
  isLive,
  live,
  onContinue,
  onResume,
  onRegenerate,
}: AssistantTurnProps) {
  const [copied, setCopied] = useState(false);
  const stats = isLive ? null : turnStats(messages);
  // The latest group shows what is happening; without one it gets a line
  const liveInGroup = Boolean(live) && parts.at(-1)?.kind === "work";

  const handleCopy = async () => {
    const text = messages
      .filter((m) => !m.toolResult && !m.steer)
      .map((m) => stripToolCallMarkup(m.content))
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="group flex gap-2 rounded-lg p-3"
    >
      <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">SHIELD Assistant</p>
          {!isLive && (
            <div className="flex gap-1">
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="rounded-md p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                  aria-label="Regenerate response"
                >
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
              <button
                onClick={handleCopy}
                className="rounded-md p-1.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                aria-label="Copy reply"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </div>
          )}
        </div>

        {parts.map((part, i) => (
          <Part
            key={partKey(part)}
            part={part}
            live={liveInGroup && i === parts.length - 1 ? live : null}
            onContinue={onContinue}
            // Only the notice that ended the turn: an older one has been
            // carried on from already
            onResume={i === parts.length - 1 ? onResume : undefined}
          />
        ))}
        {live && !liveInGroup && live.runningTool && (
          <ToolStep
            tool={live.runningTool.tool}
            serverName={live.runningTool.serverName}
            target={live.runningTool.target}
            running
          />
        )}
        {live && !liveInGroup && !live.runningTool && live.busy && (
          <ReadingIndicator />
        )}
        {children}

        {stats && (
          <div
            className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground/60"
            title={`${stats.outputTokens} tokens in ${(stats.durationMs / 1000).toFixed(1)}s across this reply, ${stats.tokensPerSecond.toFixed(1)} tokens per second`}
          >
            {stats.servedBy && <ServedBadge servedBy={stats.servedBy} />}
            <Zap className="h-3 w-3" />
            <span>
              {stats.tokensPerSecond.toFixed(1)} tok/s ·{" "}
              {formatTokens(stats.outputTokens)} tok ·{" "}
              {(stats.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
});
