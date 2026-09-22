/**
 * Tool Running Row
 *
 * Shown while a tool call is in flight. Deliberately the same shape and
 * position as ToolResultMessage so that when the call finishes the row
 * appears to settle into its result rather than one element vanishing and a
 * different one appearing in its place.
 */

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface ToolRunningRowProps {
  tool: string;
  serverName: string;
}

export function ToolRunningRow({ tool, serverName }: ToolRunningRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex justify-start"
    >
      <div className="w-full max-w-[85%] overflow-hidden rounded-md border border-border/60 bg-muted/30">
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
          {/* Sits where the chevron sits on a finished row */}
          <span className="h-3.5 w-3.5 shrink-0" />
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          <span className="font-medium text-muted-foreground">
            {serverName}.{tool}
          </span>
          <motion.span
            className="text-muted-foreground/70"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          >
            running
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
}
