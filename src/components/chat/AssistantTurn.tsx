/**
 * Assistant Turn
 *
 * Everything SHIELD did in reply to one user message, under one header: what
 * the model said, and the tool calls it made in between, as quiet steps.
 * While a reply is in progress the live pieces (streaming text, a running
 * tool, the reading indicator) are passed in as children and appear at the
 * end of the same block rather than as new messages.
 */

import { memo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Bot, Check, Copy, RefreshCw, Zap } from "lucide-react";
import { formatTokens } from "@/lib/format";
import { stripToolCallMarkup } from "@/handlers/mcpToolHandler";
import { ChatMessage } from "./ChatMessage";
import { SummaryStep, ToolStep, ToolStepGroup } from "./ToolStep";
import { groupLabel, turnStats, type TurnPart } from "./turns";
import type { Message } from "@/types/conversation";

interface AssistantTurnProps {
  messages: Message[];
  parts: TurnPart[];
  /** Streaming text, running tool, reading indicator */
  children?: ReactNode;
  isLive?: boolean;
  onContinue?: (messageId: string) => void;
  onRegenerate?: () => void;
}

function ToolResultStep({ message }: { message: Message }) {
  const result = message.toolResult!;
  return (
    <ToolStep
      tool={result.tool}
      serverName={result.serverName}
      target={result.target}
      success={result.success}
      blocked={result.blocked}
      content={message.content}
    />
  );
}

function Part({
  part,
  onContinue,
}: {
  part: TurnPart;
  onContinue?: (messageId: string) => void;
}) {
  if (part.kind === "summary") {
    return (
      <SummaryStep id={part.message.id} summary={part.message.summary ?? ""} />
    );
  }

  if (part.kind === "text") {
    const m = part.message;
    return (
      <ChatMessage
        variant="part"
        role="assistant"
        content={m.content}
        truncated={m.truncated}
        sources={m.sources}
        thinking={m.thinking}
        isThinking={m.isThinking}
        onContinue={m.truncated ? () => onContinue?.(m.id) : undefined}
      />
    );
  }

  if (part.messages.length === 1) {
    return <ToolResultStep message={part.messages[0]!} />;
  }

  const failed = part.messages.filter(
    (m) => !m.toolResult?.success && !m.toolResult?.blocked
  ).length;
  return (
    <ToolStepGroup label={groupLabel(part.messages)} failed={failed}>
      {part.messages.map((m) => (
        <ToolResultStep key={m.id} message={m} />
      ))}
    </ToolStepGroup>
  );
}

/** A summary shares its message with the text after it, so it needs its own */
function partKey(part: TurnPart): string {
  if (part.kind === "summary") return `${part.message.id}-summary`;
  return part.kind === "text" ? part.message.id : part.messages[0]!.id;
}

export const AssistantTurn = memo(function AssistantTurn({
  messages,
  parts,
  children,
  isLive,
  onContinue,
  onRegenerate,
}: AssistantTurnProps) {
  const [copied, setCopied] = useState(false);
  const stats = isLive ? null : turnStats(messages);

  const handleCopy = async () => {
    const text = messages
      .filter((m) => !m.toolResult)
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

        {parts.map((part) => (
          <Part key={partKey(part)} part={part} onContinue={onContinue} />
        ))}
        {children}

        {stats && (
          <div
            className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground/60"
            title={`${stats.outputTokens} tokens in ${(stats.durationMs / 1000).toFixed(1)}s across this reply, ${stats.tokensPerSecond.toFixed(1)} tokens per second`}
          >
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
