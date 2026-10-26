/**
 * Reading Indicator
 *
 * Shown while a reply is under way but no text has arrived yet. That gap is
 * the model reading the conversation; on a large model partly in system RAM,
 * after a big file read, it can last minutes. With nothing on screen it looked
 * like a hang and got closed (2026-09-23), so show that work is happening and
 * for how long - and, where the engine reports it (llama-server), how far the
 * reading has got. The same line covers summarising older turns to make room,
 * and a model thinking before it writes, since thinking is not shown as text.
 */

import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useGenerationStore } from "@/store/generationStore";
import { formatTokens } from "@/lib/format";
import { AnimatedCount } from "./AnimatedCount";

export function ReadingIndicator() {
  const [seconds, setSeconds] = useState(0);
  const progress = useGenerationStore((state) => state.progress);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  // Only what is new counts: a cached prompt is not read again
  const reading = progress?.phase === "reading" ? progress : null;
  const toRead = reading ? reading.total - reading.cached : 0;
  const read = reading ? reading.done - reading.cached : 0;
  // A token or two of the reply can be counted just before its text arrives
  const thinking = progress?.phase === "writing" && progress.generated > 2;

  let label: ReactNode = "Reading the conversation";
  if (progress?.phase === "summarising") {
    label = "Summarising earlier turns to free space";
  } else if (thinking) {
    label = (
      <>
        Thinking · ↓ <AnimatedCount value={progress.generated} /> tokens
      </>
    );
  } else if (reading && toRead > 0) {
    label = (
      <>
        Reading the conversation ·{" "}
        <AnimatedCount value={read} format={formatTokens} /> /{" "}
        {formatTokens(toRead)} tokens
      </>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.3 }}
      // Sits inside the reply, lined up with its tool steps
      className="py-0.5 text-[13px] text-muted-foreground"
      role="status"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>
          {label}
          {seconds >= 3 ? ` · ${seconds}s` : "…"}
        </span>
        {seconds >= 20 && !thinking && progress?.phase !== "summarising" && (
          <span className="text-muted-foreground/70">
            Long chats and large files take a while on local models.
          </span>
        )}
      </div>
      {reading && toRead > 0 && (
        <div className="mt-1.5 ml-5.5 h-0.5 w-48 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-signal/70 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, (read / toRead) * 100)}%` }}
          />
        </div>
      )}
    </motion.div>
  );
}
