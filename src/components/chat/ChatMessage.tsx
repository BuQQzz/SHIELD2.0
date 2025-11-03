import { cn } from "@/lib/utils";
import { Bot, User, Copy, Check, ArrowRight, Edit2, X, Send, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { MessageContent } from "./MessageContent";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  truncated?: boolean;
  onContinue?: () => void;
  onEdit?: (newContent: string) => void;
  onRegenerate?: () => void;
}

export function ChatMessage({
  role,
  content,
  isStreaming,
  truncated,
  onContinue,
  onEdit,
  onRegenerate,
}: MessageProps) {
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);

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
        "flex gap-3 p-4 rounded-lg group",
        isUser ? "bg-muted/50" : "bg-background"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-md",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
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
                style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)" }}
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
                style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)" }}
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
              style={{ boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)" }}
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
          <div className="text-sm text-muted-foreground prose prose-sm max-w-none dark:prose-invert">
            <MessageContent content={content} />
            {isStreaming && (
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
      </div>
    </motion.div>
  );
}
