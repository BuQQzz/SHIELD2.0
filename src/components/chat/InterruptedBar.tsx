/**
 * Interrupted Bar
 *
 * The chat's last turn was cut off by SHIELD closing (lib/interruptedTurn.ts):
 * carry on where it left off, or leave it.
 */

import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InterruptedBarProps {
  show: boolean;
  /** The model the turn ran on, named on the button */
  model?: string;
  onContinue: () => void;
  onDismiss: () => void;
}

export function InterruptedBar({
  show,
  model,
  onContinue,
  onDismiss,
}: InterruptedBarProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="mx-auto mb-2 w-full max-w-3xl px-4"
          data-testid="interrupted-bar"
        >
          <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-2 text-sm shadow-card backdrop-blur">
            <RotateCcw className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="min-w-0 flex-1">
              SHIELD closed while this task was running.
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={onDismiss}
              >
                Dismiss
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={onContinue}
                title="Send the model a note to check where the work stands and carry on"
              >
                {model ? `Continue on ${model}` : "Continue"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
