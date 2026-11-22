/**
 * Spotting a reply stuck in a loop while it streams.
 *
 * Bonsai 27B sometimes thinks in circles until the reply limit: 8,192
 * tokens of thought on a report request, and on a coder's next step at
 * 73.8 tok/s against its usual ~22, the speed speculative decoding reaches
 * only when the text repeats (2026-10-26). A loop writes its cycle out word
 * for word, so the newest stretch of text has already been written before.
 */

/**
 * Characters compared: ten normal Bonsai 27B traces never repeated 150 three
 * times, and a real loop (rewriting its HANDOFF block 56 times, 29,926
 * characters) was caught at ~8,850 (200 would wait until ~14,600)
 */
export const REPEAT_WINDOW = 150;
/** The window seen this many times in all means a loop */
export const REPEAT_TIMES = 3;
/**
 * A hosted model's thinking, compared more strictly. GLM 5.3 Flash thinks
 * 30-80K characters before a first step, drafting files and drafting them
 * again: its thinking was dropped as a loop after 4 minutes, then again on
 * the resend, which it thought through too (2026-11-22). A real loop never
 * stops repeating, so a longer stretch seen more often still catches it.
 */
export const HOSTED_REPEAT_WINDOW = 300;
export const HOSTED_REPEAT_TIMES = 5;
/** Checked once the text has grown by this much, to keep the cost small */
const CHECK_EVERY = 100;

/** Feed it the text as it streams; `push` says when the text is looping */
export class RepetitionWatch {
  private text = "";
  private checkedAt = 0;

  constructor(
    private readonly window = REPEAT_WINDOW,
    private readonly times = REPEAT_TIMES
  ) {}

  /** True once the newest REPEAT_WINDOW characters occur REPEAT_TIMES times */
  push(piece: string): boolean {
    this.text += piece;
    if (this.text.length - this.checkedAt < CHECK_EVERY) return false;
    this.checkedAt = this.text.length;
    return isLooping(this.text, this.window, this.times);
  }
}

export function isLooping(
  text: string,
  window = REPEAT_WINDOW,
  times = REPEAT_TIMES
): boolean {
  if (text.length < window * times) return false;
  const tail = text.slice(-window);
  // Blank space (indentation, padding) is not a reasoning loop
  if (!tail.trim()) return false;
  let seen = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(tail, from);
    if (at === -1) return false;
    seen += 1;
    if (seen >= times) return true;
    // Overlaps count: a cycle shorter than the window shows once per turn
    from = at + 1;
  }
}
