/**
 * Stuck Bar
 *
 * A strip above the composer while the model works: how long the current
 * step has run, and, once it looks stuck, what to do about it without
 * stopping the whole turn (src/services/llamaServer/rescue.ts). Stop still
 * ends everything.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Hourglass, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGenerationStore } from "@/store/generationStore";
import {
  minutesAndSeconds,
  stuckState,
  type RequestStatus,
  type RescueAction,
} from "@/services/llamaServer/rescue";

const POLL_MS = 2000;

interface StuckBarProps {
  isGenerating: boolean;
}

export function StuckBar({ isGenerating }: StuckBarProps) {
  const [status, setStatus] = useState<RequestStatus | null>(null);
  /** The button pressed, until the request it cut off is replaced */
  const [acting, setActing] = useState<RescueAction | null>(null);

  useEffect(() => {
    if (!isGenerating) {
      setStatus(null);
      setActing(null);
      return;
    }
    let live = true;
    let previous: RequestStatus | null = null;
    const poll = async () => {
      try {
        const result = await window.llama.requestStatus();
        if (!live) return;
        const next = result.status ?? null;
        // A new request (the retry, or the next step): the buttons are back
        if (!next || !previous || next.elapsedMs < previous.elapsedMs) {
          setActing(null);
        }
        previous = next;
        setStatus(next);
      } catch {
        // Informational: never let it break the chat
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [isGenerating]);

  const state = stuckState(status);

  const act = async (action: RescueAction) => {
    setActing(action);
    if (action === "skip") {
      useGenerationStore.getState().setSkipRequested(true);
    }
    const result = await window.llama.rescue(action).catch(() => null);
    if (!result?.cutOff) {
      setActing(null);
      // Nothing of an agent's was running to skip
      if (action === "skip") {
        useGenerationStore.getState().setSkipRequested(false);
      }
    }
  };

  // Short: the bar shares a narrow column with its buttons
  const who = status?.agent ? "Agent step" : "Reply";
  const message =
    state === "frozen"
      ? `No output for ${minutesAndSeconds(status?.idleMs ?? 0)}: the server may have frozen.`
      : state === "slow"
        ? `${who} running ${minutesAndSeconds(status?.elapsedMs ?? 0)}: it may be stuck.`
        : `${who}: ${minutesAndSeconds(status?.elapsedMs ?? 0)}`;
  const doing =
    acting === "restart"
      ? "Restarting the server…"
      : acting === "nudge"
        ? "Nudging…"
        : acting === "skip"
          ? "Skipping…"
          : null;

  return (
    <AnimatePresence>
      {isGenerating && state !== "hidden" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="mx-auto mb-2 w-full max-w-3xl px-4"
          data-testid="stuck-bar"
        >
          <div
            className={`flex items-center gap-3 rounded-lg border px-3 text-sm backdrop-blur ${
              state === "timer"
                ? "border-transparent py-0.5 text-xs text-muted-foreground"
                : "border-border bg-muted/60 py-2"
            }`}
          >
            {state === "timer" ? (
              <Hourglass className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span className="min-w-0 flex-1">{doing ?? message}</span>
            {state !== "timer" && !doing && (
              <div className="flex shrink-0 items-center gap-1.5">
                {status?.agent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => void act("skip")}
                    title="End this agent's step with what it has; the rest of the work goes on"
                  >
                    Skip step
                  </Button>
                )}
                {state === "frozen" ? (
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => void act("restart")}
                    title="Restart the model server and send this step again"
                  >
                    Restart and retry
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={() => void act("nudge")}
                    title="Drop this reply and ask again, without long thinking"
                  >
                    Nudge
                  </Button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
