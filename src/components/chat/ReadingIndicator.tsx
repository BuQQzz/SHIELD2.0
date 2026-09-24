/**
 * Reading Indicator
 *
 * Shown while a reply is under way but no text has arrived yet. That gap is
 * the model reading the conversation; on a large model partly in system RAM,
 * after a big file read, it can last minutes. With nothing on screen it looked
 * like a hang and got closed (2026-09-23), so show that work is happening and
 * for how long.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

export function ReadingIndicator() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.3 }}
      // Sits inside the reply, lined up with its tool steps
      className="flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground"
      role="status"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>
        Reading the conversation
        {seconds >= 3 ? ` · ${seconds}s` : "…"}
      </span>
      {seconds >= 20 && (
        <span className="text-muted-foreground/70">
          Long chats and large files take a while on local models.
        </span>
      )}
    </motion.div>
  );
}
