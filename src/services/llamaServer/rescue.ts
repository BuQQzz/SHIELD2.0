/**
 * A request that looks stuck, and what the user can do about it without
 * stopping the whole turn (the stuck bar above the chat input).
 *
 * - nudge: drop the reply and send the same message again, without
 *   thinking, with a note to get on with it. For a model going round in
 *   circles: a 9-minute coder reply that thought on and on (2026-10-26).
 * - skip: end the agent's step with what it has; the orchestrator goes on.
 * - restart: the server froze (no new token; `/slots` busy with `n_decoded`
 *   stuck, `/health` still ok: three times by 2026-10-26). A frozen slot
 *   stays busy, so the next request would wait behind it; the server is
 *   restarted and the same message sent again.
 *
 * No node imports: the window reads the thresholds too.
 */

export type RescueAction = "nudge" | "skip" | "restart";

/** The request in progress, as the stuck bar sees it */
export interface RequestStatus {
  /** A sub-agent's request, not the orchestrator's or the chat's */
  agent: boolean;
  phase: "summarising" | "reading" | "writing";
  /** Since this request was sent (a retry starts again from 0) */
  elapsedMs: number;
  /** Since the server last reported progress: a token, thought or prompt read */
  idleMs: number;
}

/**
 * No progress for this long: the server has probably frozen. A normal step
 * writes ~20 tok/s and reads a batch of prompt every second or two.
 */
export const FROZEN_AFTER_MS = 60 * 1000;

/** One reply running this long, still writing: probably going round in circles */
export const SLOW_AFTER_MS = 3 * 60 * 1000;

/** A step shorter than this needs no timer */
const SHOW_AFTER_MS = 30 * 1000;

/** What the stuck bar shows for the request in progress */
export type StuckState = "hidden" | "timer" | "frozen" | "slow";

export function stuckState(status: RequestStatus | null): StuckState {
  if (!status) return "hidden";
  // Summarising is one request with no live progress to watch
  if (status.phase !== "summarising" && status.idleMs >= FROZEN_AFTER_MS) {
    return "frozen";
  }
  if (status.elapsedMs >= SLOW_AFTER_MS) return "slow";
  return status.elapsedMs >= SHOW_AFTER_MS ? "timer" : "hidden";
}

export function minutesAndSeconds(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Added to the message a nudge sends again */
export const NUDGE_NOTE =
  "\n\n[SHIELD: the user stopped your last try at answering this because it was taking too long. Do not think it over at length. Make your next tool call now, or, if the work is done, give your answer.]";

/** Where a skipped agent's reply was cut off */
export const SKIPPED_BY_USER =
  "the user skipped it because it was taking too long";
