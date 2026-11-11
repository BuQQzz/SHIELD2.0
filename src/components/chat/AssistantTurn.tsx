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
import { Check, Copy, RefreshCw, User } from "lucide-react";
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

  // No avatar or name: the reply reads as plain text under your message,
  // with copy, retry and its speed below it
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group"
    >
      <div className="space-y-2 overflow-hidden">
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

        {!isLive && (
          <div className="flex items-center gap-0.5 pt-0.5 text-[11px] text-muted-foreground/70">
            <button
              onClick={handleCopy}
              className="rounded-md p-1.5 opacity-0 transition-opacity duration-150 hover:bg-foreground/5 focus-visible:opacity-100 group-hover:opacity-100"
              aria-label="Copy reply"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-signal" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded-md p-1.5 opacity-0 transition-opacity duration-150 hover:bg-foreground/5 focus-visible:opacity-100 group-hover:opacity-100"
                aria-label="Regenerate response"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            {stats && (
              <span
                className="ml-1 flex items-center gap-1"
                title={`${stats.outputTokens} tokens in ${(stats.durationMs / 1000).toFixed(1)}s across this reply, ${stats.tokensPerSecond.toFixed(1)} tokens per second`}
              >
                {stats.servedBy && <ServedBadge servedBy={stats.servedBy} />}
                {stats.tokensPerSecond.toFixed(1)} tok/s ·{" "}
                {formatTokens(stats.outputTokens)} tok ·{" "}
                {(stats.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});
