/**
 * Loop Guard
 *
 * A local model that loses its way repeats itself until the token limit.
 * Gemma 4 wrote one garbled line for 8,192 tokens (3.4 minutes), and at a
 * low temperature went round "Wait, I should check if f3.ps1 is part of
 * this." until the limit (2026-09-26). This spots the repetition in the
 * visible reply so it can be stopped early.
 *
 * Written files stream through here too (Qwen's tool calls are text), so
 * ordinary repetition must pass: short lines (a brace, a table rule) never
 * count, a few identical lines in a page do not add up to a loop, and a
 * block must hold a few different characters (a row of dashes is not one).
 */

/** Lines shorter than this never count */
const MIN_LINE = 20;
/** Recent lines considered */
const WINDOW = 80;
/** Fewer lines than this is too little to judge */
const MIN_LINES = 16;
/** Share of the recent lines that repeat an earlier one in the window */
const LOOPING_SHARE = 0.6;
/** A block repeated this often in a row at the very end is a loop */
const TAIL_COPIES = 5;
const MIN_PERIOD = 8;
const MAX_PERIOD = 400;
/** Check again after this much new text */
const CHECK_EVERY = 200;

export const LOOP_NOTE =
  "\n\n*SHIELD stopped this reply: the model kept repeating itself.*";

function repeatedLines(text: string): boolean {
  const lines = text
    .slice(-12_000)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= MIN_LINE)
    .slice(-WINDOW);
  if (lines.length < MIN_LINES) return false;
  const seen = new Set<string>();
  let repeats = 0;
  for (const line of lines) {
    if (seen.has(line)) repeats++;
    else seen.add(line);
  }
  return repeats / lines.length >= LOOPING_SHARE;
}

/** The same block at least TAIL_COPIES times in a row at the end */
function repeatedTail(text: string): boolean {
  const tail = text.slice(-(MAX_PERIOD * TAIL_COPIES));
  for (let period = MIN_PERIOD; period <= MAX_PERIOD; period++) {
    if (tail.length < period * TAIL_COPIES) break;
    const block = tail.slice(-period);
    if (new Set(block.replace(/\s/g, "")).size < 4) continue;
    let copies = 1;
    while (
      copies < TAIL_COPIES &&
      tail.slice(-period * (copies + 1), -period * copies) === block
    ) {
      copies++;
    }
    if (copies >= TAIL_COPIES) return true;
  }
  return false;
}

/** Whether the text so far ends in a loop */
export function isLooping(text: string): boolean {
  return repeatedLines(text) || repeatedTail(text);
}

/**
 * Follows a streamed reply; `push` returns true once, on the token that
 * shows the reply is looping.
 */
export class LoopGuard {
  private text = "";
  private checkedAt = 0;
  private tripped = false;

  get hasTripped(): boolean {
    return this.tripped;
  }

  push(token: string): boolean {
    if (this.tripped) return false;
    this.text += token;
    if (this.text.length - this.checkedAt < CHECK_EVERY) return false;
    this.checkedAt = this.text.length;
    this.tripped = isLooping(this.text);
    return this.tripped;
  }
}
