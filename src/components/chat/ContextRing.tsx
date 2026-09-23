/**
 * Context Ring
 *
 * How full the model's context window is, as a small ring beside the
 * composer. On a local model this is a real, physical limit: when it fills,
 * old turns get shifted out and the model starts forgetting the start of the
 * conversation. Showing it lets the user start a new chat before that bites.
 */

import { useGenerationStore } from "@/store/generationStore";
import { formatTokens } from "@/lib/format";

const SIZE = 16;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ContextRing() {
  const context = useGenerationStore((state) => state.context);
  if (!context || context.size <= 0) return null;

  const fraction = Math.min(1, Math.max(0, context.used / context.size));
  const percent = Math.round(fraction * 100);
  const tone =
    fraction >= 0.95
      ? "text-red-500"
      : fraction >= 0.8
        ? "text-amber-500"
        : "text-muted-foreground";

  const label = `Context ${formatTokens(context.used)} / ${formatTokens(context.size)} (${percent}%)`;
  const hint =
    fraction >= 0.8
      ? " - nearly full; older messages will start to drop out. A new chat starts fresh."
      : "";

  return (
    <div
      className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground"
      title={label + hint}
      aria-label={label}
      role="img"
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={tone}
        aria-hidden
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 300ms ease-out" }}
        />
      </svg>
      <span className="tabular-nums">{percent}%</span>
    </div>
  );
}
