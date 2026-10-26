/**
 * Summaries Menu
 *
 * When SHIELD summarises older turns to make room, the summary shows as a
 * step in the reply that needed it - easy to lose further up a long chat.
 * This pill in the chat header counts the chat's summaries and lists them;
 * picking one scrolls to its step and opens it. When a new summary lands it
 * springs in with a label for a few seconds.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useSummaryFocus } from "@/stores/summary-focus-store";

export interface ChatSummary {
  /** The message the summary is on */
  id: string;
  summary: string;
  timestamp: Date;
}

/** The model's own "State:" line, else a plain title */
function summaryTitle(summary: string): string {
  return (
    summary.match(/^State:\s*(.+)$/m)?.[1]?.trim() || "Earlier turns summarised"
  );
}

/** "5:35 PM · covers 4 requests" */
function summaryMeta(summary: ChatSummary): string {
  const time = new Date(summary.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const requests = (summary.summary.match(/^\d+\. "/gm) ?? []).length;
  if (requests === 0) return time;
  return `${time} · covers ${requests} request${requests === 1 ? "" : "s"}`;
}

interface SummariesMenuProps {
  conversationId?: string;
  summaries: ChatSummary[];
}

export function SummariesMenu({
  conversationId,
  summaries,
}: SummariesMenuProps) {
  const focus = useSummaryFocus((state) => state.focus);
  const [announce, setAnnounce] = useState(false);
  const seen = useRef({ conversationId, count: summaries.length });

  // A summary added to this chat is news; opening a chat that already has
  // some is not
  useEffect(() => {
    const before = seen.current;
    seen.current = { conversationId, count: summaries.length };
    if (
      before.conversationId === conversationId &&
      summaries.length > before.count
    ) {
      setAnnounce(true);
    }
  }, [conversationId, summaries.length]);

  useEffect(() => {
    if (!announce) return;
    const timer = setTimeout(() => setAnnounce(false), 4000);
    return () => clearTimeout(timer);
  }, [announce]);

  return (
    <AnimatePresence>
      {summaries.length > 0 && (
        <motion.div
          key="summaries"
          initial={{ opacity: 0, y: -10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                animate={announce ? { scale: [1, 1.12, 1] } : { scale: 1 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  announce && "border-signal/60 bg-signal-soft text-foreground"
                )}
                title="Earlier turns of this chat, summarised for the model"
                aria-label={`${summaries.length} summaries of earlier turns`}
              >
                <ScrollText className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums">{summaries.length}</span>
                <AnimatePresence initial={false}>
                  {announce && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="overflow-hidden whitespace-nowrap"
                    >
                      Earlier turns summarised
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="text-xs leading-snug font-normal text-muted-foreground">
                To make room, older turns were summarised for the model. The
                chat itself keeps everything.
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[...summaries].reverse().map((summary) => (
                <DropdownMenuItem
                  key={summary.id}
                  onClick={() => focus(summary.id)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="line-clamp-2 text-sm">
                    {summaryTitle(summary.summary)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {summaryMeta(summary)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
