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
    <div className="mb-2 border border-border/50 rounded-lg overflow-hidden bg-muted/30">
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full px-2.5 py-1.5 flex items-center gap-2",
          "text-xs font-medium text-muted-foreground",
          "hover:bg-muted/50 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring/50"
        )}
      >
        {/* Animated Brain Icon */}
        <Brain
          className={cn(
            "h-3.5 w-3.5 text-violet-500 dark:text-violet-400",
            isStreaming && "animate-pulse"
          )}
        />

        {/* Label */}
        <span className="flex-1 text-left">
          {isStreaming ? "Thinking..." : "Reasoning"}
        </span>

        {/* Streaming Indicator */}
        {isStreaming && (
          <span className="flex items-center gap-0.5">
            <span
              className="h-1 w-1 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-1 w-1 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-1 w-1 rounded-full bg-violet-500 dark:bg-violet-400 animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </span>
        )}

        {/* Expand/Collapse Icon */}
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Expandable Thinking Content */}
      {isExpanded && (
        <div className="px-2.5 py-1.5 border-t border-border/50">
          <div
            className={cn(
              "text-xs text-muted-foreground whitespace-pre-wrap font-mono",
              "prose prose-xs dark:prose-invert max-w-none",
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
