/**
 * Context Ring
 *
 * How full the model's context window is, as a small ring beside the
 * composer; click it for what is filling it. On a local model this is a
 * real, physical limit: when it fills, the oldest turns are dropped and the
 * model starts forgetting the start of the conversation. Showing what takes
 * the space lets the user do something about it.
 */

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGenerationStore } from "@/store/generationStore";
import { formatTokens } from "@/lib/format";
import type { ContextBreakdown } from "@/types/electron";

const SIZE = 16;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type PartKey = keyof ContextBreakdown["parts"];

const PARTS: Array<{ key: PartKey; label: string; color: string }> = [
  { key: "systemPrompt", label: "System prompt", color: "bg-slate-400" },
  {
    key: "toolInstructions",
    label: "Tool instructions",
    color: "bg-violet-500",
  },
  { key: "messages", label: "Messages", color: "bg-sky-500" },
  { key: "toolResults", label: "Tool results", color: "bg-emerald-500" },
  { key: "formatting", label: "Chat formatting", color: "bg-zinc-500" },
];

/** One actionable line about whatever is taking the most space */
function tipFor(breakdown: ContextBreakdown): string | null {
  const { parts, total, size } = breakdown;
  if (total === 0) return null;
  const largest = PARTS.reduce((a, b) => (parts[b.key] > parts[a.key] ? b : a));
  const share = Math.round((parts[largest.key] / total) * 100);

  switch (largest.key) {
    case "toolResults":
      return `Tool results are ${share}% of what's used. Large file reads fill the context fastest - ask for the part of a file you need.`;
    case "toolInstructions":
      return `Tool instructions are ${share}% of what's used. Read-only mode describes fewer tools.`;
    case "systemPrompt":
      return `The system prompt is ${share}% of what's used. A shorter custom prompt in Settings frees space.`;
    case "messages":
      return total / size >= 0.8
        ? "This chat is getting long. A new chat starts with an empty context."
        : null;
    default:
      return null;
  }
}

function Ring({ fraction, tone }: { fraction: number; tone: string }) {
  return (
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
  );
}

export function ContextRing() {
  const context = useGenerationStore((state) => state.context);
  const lastStats = useGenerationStore((state) => state.lastStats);
  const [breakdown, setBreakdown] = useState<ContextBreakdown | null>(null);
  const [loading, setLoading] = useState(false);

  if (!context || context.size <= 0) return null;

  // Same source in the main process; the breakdown is just fresher
  const used = breakdown?.used ?? context.used;
  const size = breakdown?.size ?? context.size;
  const fraction = Math.min(1, Math.max(0, used / size));
  const percent = Math.round(fraction * 100);
  const tone =
    fraction >= 0.95
      ? "text-red-500"
      : fraction >= 0.8
        ? "text-amber-500"
        : "text-muted-foreground";

  const load = async (open: boolean) => {
    // Dropped on close so the ring goes back to the live number
    if (!open) {
      setBreakdown(null);
      return;
    }
    setLoading(true);
    try {
      const result = await window.llama.getContextBreakdown();
      setBreakdown(result.breakdown ?? null);
    } catch {
      setBreakdown(null);
    } finally {
      setLoading(false);
    }
  };

  const tip = breakdown ? tipFor(breakdown) : null;
  const free = Math.max(0, size - used);
  // When the chat outgrows the window, shares are of the whole chat so they
  // add up to 100% instead of reading 234%
  const scale = Math.max(breakdown?.total ?? used, size);

  return (
    <DropdownMenu onOpenChange={load}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={`Context ${formatTokens(used)} / ${formatTokens(size)} (${percent}%) - click for details`}
          aria-label={`Context ${percent}% full`}
        >
          <Ring fraction={fraction} tone={tone} />
          <span className="tabular-nums">{percent}%</span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top" className="w-80 p-3">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-medium">Context window</span>
          <span className="tabular-nums text-muted-foreground">
            {formatTokens(used)} / {formatTokens(size)} ({percent}%)
          </span>
        </div>

        {/* Segmented bar: each kind of content, then free space */}
        <div className="mb-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {breakdown &&
            PARTS.map(({ key, color }) =>
              breakdown.parts[key] > 0 ? (
                <div
                  key={key}
                  className={color}
                  style={{ width: `${(breakdown.parts[key] / scale) * 100}%` }}
                />
              ) : null
            )}
        </div>

        {loading && !breakdown && (
          <p className="text-xs text-muted-foreground">Counting tokens…</p>
        )}

        {breakdown && (
          <div className="space-y-1.5 text-xs">
            {PARTS.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} />
                <span className="flex-1">{label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatTokens(breakdown.parts[key])}
                </span>
                <span className="w-10 text-right tabular-nums text-muted-foreground/70">
                  {((breakdown.parts[key] / scale) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-muted" />
              <span className="flex-1">Free space</span>
              <span className="tabular-nums text-muted-foreground">
                {formatTokens(free)}
              </span>
              <span className="w-10 text-right tabular-nums text-muted-foreground/70">
                {((free / scale) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-1 border-t pt-2 text-xs text-muted-foreground">
          {breakdown && breakdown.trainContextSize > size && (
            <p>
              Loaded at {formatTokens(size)} · model supports{" "}
              {formatTokens(breakdown.trainContextSize)}
            </p>
          )}
          {lastStats && lastStats.outputTokens > 0 && (
            <p>
              Last reply: {lastStats.tokensPerSecond.toFixed(1)} tok/s ·{" "}
              {formatTokens(lastStats.outputTokens)} tok ·{" "}
              {(lastStats.durationMs / 1000).toFixed(1)}s
            </p>
          )}
          {breakdown && breakdown.dropped > 0 ? (
            <p className="text-amber-500">
              This chat is {formatTokens(breakdown.total)}; the oldest{" "}
              {formatTokens(breakdown.dropped)} no longer fit and are dropped,
              so the model has lost the start of the conversation.
            </p>
          ) : (
            <p>When it fills, the oldest messages are dropped to make room.</p>
          )}
          {tip && <p className="text-foreground/80">{tip}</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
