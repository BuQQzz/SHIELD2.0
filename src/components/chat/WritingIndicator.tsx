/**
 * Writing Indicator
 *
 * Under a reply while it streams: tokens so far, counting up as they
 * arrive, and the speed. The reading indicator's live progress, carried on
 * once the text starts.
 */

import { useGenerationStore } from "@/store/generationStore";
import { AnimatedCount } from "./AnimatedCount";

export function WritingIndicator() {
  const progress = useGenerationStore((state) => state.progress);
  if (progress?.phase !== "writing") return null;

  return (
    <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground/70">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
      <span>
        ↓ <AnimatedCount value={progress.generated} /> token
        {progress.generated === 1 ? "" : "s"}
      </span>
      {progress.tokensPerSecond > 0 && (
        <span className="tabular-nums">
          · {progress.tokensPerSecond.toFixed(1)} tok/s
        </span>
      )}
    </div>
  );
}
