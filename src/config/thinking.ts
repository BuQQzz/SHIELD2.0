/**
 * How long a model thinks before it answers, chosen by the user per model
 * in the composer. "Default" leaves the model (and SHIELD's tuning for it)
 * as it is. A hosted model on a design question thought for the whole
 * 8,192-token reply, twice, and wrote nothing (deepseek-v4.1-flash-1017,
 * 2026-11-16): the user can now ask it for less, or for more.
 */

export const THINKING_LEVELS = [
  "default",
  "instant",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const THINKING_LABELS: Record<ThinkingLevel, string> = {
  default: "Default",
  instant: "Instant",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

export const THINKING_NOTES: Record<ThinkingLevel, string> = {
  default: "As the model and SHIELD's settings for it decide",
  instant: "Answers without thinking first",
  low: "Thinks briefly",
  medium: "Thinks a moderate amount",
  high: "Thinks carefully",
  xhigh: "Thinks at length",
  max: "Thinks as long as it needs",
};

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return (
    typeof value === "string" &&
    (THINKING_LEVELS as readonly string[]).includes(value)
  );
}

/**
 * The effort sent with a request: a hosted provider takes every level; a
 * local template knows low, medium and high at most. undefined for Default
 * and Instant (Instant turns thinking off instead).
 */
export function effortFor(
  level: ThinkingLevel,
  hosted: boolean
): string | undefined {
  if (level === "default" || level === "instant") return undefined;
  if (hosted) return level;
  return level === "xhigh" || level === "max" ? "high" : level;
}
