import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  thinking: string;
  isStreaming?: boolean;
  defaultExpanded?: boolean;
}

export function ThinkingIndicator({
  thinking,
  isStreaming = false,
  defaultExpanded = false,
}: ThinkingIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!thinking && !isStreaming) return null;

  return (
    <div className="mb-3 border border-border/50 rounded-lg overflow-hidden bg-muted/30">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full px-3 py-2 flex items-center gap-2",
          "text-sm font-medium text-muted-foreground",
          "hover:bg-muted/50 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring/50"
        )}
      >
        {/* Animated Brain Icon */}
        <Brain
          className={cn(
            "h-4 w-4 text-violet-500 dark:text-violet-400",
            isStreaming && "animate-pulse"
          )}
        />

        {/* Label */}
        <span className="flex-1 text-left">
          {isStreaming ? "Thinking..." : "AI Reasoning"}
        </span>

        {/* Streaming Indicator */}
        {isStreaming && (
          <span className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-1.5 w-1.5 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </span>
        )}

        {/* Expand/Collapse Icon */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Expandable Thinking Content */}
      {isExpanded && (
        <div className="px-3 py-2 border-t border-border/50">
          <div
            className={cn(
              "text-sm text-muted-foreground whitespace-pre-wrap font-mono",
              "prose prose-sm dark:prose-invert max-w-none",
              isStreaming && "animate-in fade-in duration-200"
            )}
          >
            {thinking || "Processing..."}
          </div>
        </div>
      )}
    </div>
  );
}
