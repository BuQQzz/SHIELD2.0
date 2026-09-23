import { cn } from "@/lib/utils";
import { formatTokens } from "@/lib/format";
import {
  Bot,
  User,
  Copy,
  Check,
  ArrowRight,
  Edit2,
  X,
  Send,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LazyMessageContent } from "../lazy";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { useState, useMemo, memo, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GenerationStats, SearchResult } from "@/types/electron";
import {
  stripToolCallMarkup,
  extractToolCalls,
} from "@/handlers/mcpToolHandler";
import { streamingToolCallPreview } from "@/handlers/toolCallParsing";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  truncated?: boolean;
  sources?: SearchResult[];
  thinking?: string; // Chain-of-thought analysis from models
  isThinking?: boolean; // True while streaming thinking content
  /** Tokens and speed of this reply */
  stats?: GenerationStats;
  onContinue?: () => void;
  onEdit?: (newContent: string) => void;
  onRegenerate?: () => void;
}

export const ChatMessage = memo(function ChatMessage({
  role,
  content: rawContent,
  isStreaming,
  truncated,
  sources,
  thinking,
  isThinking,
  stats,
  onContinue,
  onEdit,
  onRegenerate,
}: MessageProps) {
  // Tool call markup is plumbing between the model and the MCP layer, not
  // something the user should read. The raw text is still what gets parsed
  // and what is stored - this only affects what is shown.
  // While streaming, a call that is still being written is held back too,
  // and a "preparing" line stands in for it until the tool row appears.
  // Memoised: the list re-renders on every streamed token, and finished
  // messages should not be re-parsed each time.
  const { content, pendingTool } = useMemo(() => {
    if (role !== "assistant") return { content: rawContent, pendingTool: null };
    if (isStreaming) {
      const preview = streamingToolCallPreview(rawContent);
      return { content: preview.text, pendingTool: preview.pendingTool };
    }
    return { content: stripToolCallMarkup(rawContent), pendingTool: null };
  }, [role, rawContent, isStreaming]);

  // A reply that was nothing but a tool call has nothing left to show once
  // the markup is stripped. Hiding it is right ONLY when the call actually
  // parsed, because then the tool row below reports what happened. If it did
  // not parse, hiding the message leaves a blank screen and the user has no
  // idea the model replied at all - so show the raw text instead.
  const strippedToNothing =
    role === "assistant" &&
    !isStreaming &&
    content.trim() === "" &&
    !thinking &&
    rawContent.trim() !== "";

  const producedAToolCall = useMemo(
    () => strippedToNothing && extractToolCalls(rawContent).length > 0,
    [strippedToNothing, rawContent]
  );

  const unparseableOutput = strippedToNothing && !producedAToolCall;

  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [showSources, setShowSources] = useState(false);

  if (producedAToolCall) return null;

  if (unparseableOutput) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2">
          <p className="mb-1 text-xs text-muted-foreground">
            The model replied with a tool call SHIELD could not read, so nothing
            ran. Raw output:
          </p>
          <pre className="max-h-48 overflow-auto text-xs whitespace-pre-wrap text-muted-foreground/80">
            {rawContent.trim()}
          </pre>
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleStartEdit = () => {
    setIsEditing(true);
    setEditedContent(content);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(content);
  };

  const handleSaveEdit = () => {
    if (editedContent.trim() && onEdit) {
      onEdit(editedContent.trim());
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex gap-2 p-3 rounded-lg group",
        isUser ? "bg-muted/50" : "bg-background"
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-md",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>
      <div className="flex-1 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {isUser ? "You" : "SHIELD Assistant"}
          </p>
          <div className="flex gap-1">
            {isUser && !isEditing && onEdit && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStartEdit}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted"
                aria-label="Edit message"
              >
                <Edit2 className="h-4 w-4 text-muted-foreground" />
              </motion.button>
            )}
            {!isUser && !isStreaming && onRegenerate && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onRegenerate}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted"
                aria-label="Regenerate response"
              >
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted"
              aria-label="Copy message"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </motion.button>
          </div>
        </div>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              onKeyDown={handleKeyDown}
              className="min-h-[100px] resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                onClick={handleSaveEdit}
                size="sm"
                disabled={!editedContent.trim()}
              >
                <Send className="h-3 w-3 mr-1" />
                Save & Regenerate
              </Button>
              <Button onClick={handleCancelEdit} size="sm" variant="outline">
                <X className="h-3 w-3 mr-1" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Show thinking indicator for assistant messages with chain-of-thought */}
            {!isUser && (thinking || isThinking) && (
              <ThinkingIndicator
                thinking={thinking || ""}
                isStreaming={isThinking}
                defaultExpanded={false}
              />
            )}

            <div className="text-sm text-muted-foreground prose prose-sm max-w-none dark:prose-invert">
              <Suspense
                fallback={<div className="animate-pulse">Loading...</div>}
              >
                <LazyMessageContent content={content} />
              </Suspense>
              {pendingTool !== null && (
                <div className="not-prose mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    Preparing tool call
                    {pendingTool ? `: ${pendingTool}` : ""}…
                  </span>
                </div>
              )}
              {isStreaming && pendingTool === null && (
                <motion.span
                  animate={{ opacity: [1, 0] }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    repeatType: "reverse",
                  }}
                  className="inline-block w-2 h-4 ml-1 bg-primary"
                />
              )}
            </div>
          </div>
        )}
        {stats && !isStreaming && stats.outputTokens > 0 && (
          <div
            className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground/60"
            title={`${stats.outputTokens} tokens in ${(stats.durationMs / 1000).toFixed(1)}s, generated at ${stats.tokensPerSecond.toFixed(1)} tokens per second`}
          >
            <Zap className="h-3 w-3" />
            <span>
              {stats.tokensPerSecond.toFixed(1)} tok/s ·{" "}
              {formatTokens(stats.outputTokens)} tok ·{" "}
              {(stats.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        )}
        {truncated && !isStreaming && (
          <Button
            onClick={onContinue}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            <ArrowRight className="h-4 w-4 mr-1" />
            Continue
          </Button>
        )}
        {sources && sources.length > 0 && !isStreaming && (
          <div className="mt-3">
            <Button
              onClick={() => setShowSources(!showSources)}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              {showSources ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Hide Sources ({sources.length})
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  View Sources ({sources.length})
                </>
              )}
            </Button>
            <AnimatePresence>
              {showSources && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 space-y-2 overflow-hidden"
                >
                  {sources.map((source, index) => (
                    <motion.a
                      key={index}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-start gap-2 p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors group"
                    >
                      <span className="text-xs font-medium text-muted-foreground shrink-0 mt-0.5">
                        {index + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium group-hover:text-primary transition-colors line-clamp-1">
                          {source.title}
                        </p>
                        {source.snippet && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {source.snippet}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/70 mt-1 truncate">
                          {new URL(source.url).hostname}
                        </p>
                      </div>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.a>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
});
