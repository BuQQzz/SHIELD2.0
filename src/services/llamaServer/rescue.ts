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
  /**
   * A hosted model's request. It thinks for minutes at a high setting, and
   * a gateway may hold the thinking back until it is done: the local rules
   * showed "the server may have frozen" and "Restart and retry" while
   * deepseek-v4.1-flash-1017 thought on Extra high (2026-11-16)
   */
  hosted?: boolean;
}

/**
 * A hosted request with nothing at all back for this long: worth asking
 * again. Shorter waits are thinking, which its status line counts.
 */
export const HOSTED_QUIET_MS = 5 * 60 * 1000;

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
/** "quiet": a hosted request with nothing back for HOSTED_QUIET_MS */
export type StuckState = "hidden" | "timer" | "frozen" | "slow" | "quiet";

export function stuckState(status: RequestStatus | null): StuckState {
  if (!status) return "hidden";
  // No timer and no "may be stuck": the status line shows the seconds, and
  // there is no server of the user's to restart
  if (status.hosted) {
    return status.idleMs >= HOSTED_QUIET_MS ? "quiet" : "hidden";
  }
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

/**
 * Added to a message whose reply came back empty, for its one more try.
 * Qwen3.8 IQ1_M with thinking off ended its reply after 2 tokens, and the
 * turn ended with nothing done (2026-11-05)
 */
export const EMPTY_REPLY_NOTE =
  "\n\n[SHIELD: your last reply to this was empty. Make your next tool call now, or, if the work is done, give your answer.]";

/** A hosted model's thinking used the whole reply limit (LlamaServerProvider) */
export const THOUGHT_OUT_NOTE =
  "\n\n[SHIELD: your thinking used up the whole reply limit and nothing was written. Think briefly, then make the next tool call. Do the work in small steps.]";

/** Where a skipped agent's reply was cut off */
export const SKIPPED_BY_USER =
  "the user skipped it because it was taking too long";
