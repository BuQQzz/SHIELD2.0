/**
 * Turn Ask Bar
 *
 * A hosted model's turn paused for the user: it sent the same call a third
 * time, or the task passed the spend limit. Go on, or stop
 * (store/turnAskStore.ts). Hidden when nothing is asked.
 */

import { motion, AnimatePresence } from "framer-motion";
import { CircleDollarSign, Hourglass, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTurnAskStore } from "@/store/turnAskStore";

export function TurnAskBar() {
  const pending = useTurnAskStore((state) => state.pending);
  const answer = useTurnAskStore((state) => state.answer);
  const spend = pending?.kind === "spend";
  const idle = pending?.kind === "idle";

  return (
    <AnimatePresence>
      {pending && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="mx-auto mb-2 w-full max-w-3xl px-4"
          data-testid="turn-ask-bar"
        >
          <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-2 text-sm shadow-card backdrop-blur">
            {spend ? (
              <CircleDollarSign className="h-4 w-4 shrink-0 text-amber-500" />
            ) : idle ? (
              <Hourglass className="h-4 w-4 shrink-0 text-amber-500" />
            ) : (
              <Repeat className="h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span className="min-w-0 flex-1">
              {spend ? (
                <>This task has cost {pending.text}.</>
              ) : idle ? (
                <>The model has made {pending.text}.</>
              ) : (
                <>
                  The model keeps repeating the same step:{" "}
                  <span className="font-mono text-xs">{pending.text}</span>
                </>
              )}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => answer(false)}
              >
                Stop
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => answer(true)}
                title={
                  spend
                    ? "Let the model go on; asked again after another limit's worth"
                    : idle
                      ? "Let the model go on; asked again after as many more calls"
                      : "Run the step again and let the model go on"
                }
              >
                {spend || idle ? "Keep going" : "Allow repeat"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
