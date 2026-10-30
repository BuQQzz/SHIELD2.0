/**
 * Closest Lines
 *
 * Where in a file an edit's oldText most nearly is, for an edit that found
 * no exact match. Bonsai 27B built oldText from memory: once a heading the
 * file never had, once a table row with a " |" the real row lacks, and was
 * told only to read the file again (2026-10-28). Shown the real lines, a
 * model can copy them.
 */

/** A file line must be at least this like the anchor to be shown */
const MIN_SIMILARITY = 0.45;
/** Most lines shown for one edit */
const MAX_LINES = 12;
/** Longest line shown, in characters */
const MAX_LINE_CHARS = 300;
/** Files longer than this are not searched */
const MAX_FILE_LINES = 20_000;

export interface ClosestLines {
  /** 1-based line number of the first line shown */
  line: number;
  text: string;
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  const s = text.toLowerCase().replace(/\s+/g, " ");
  for (let i = 0; i < s.length - 1; i++) {
    const pair = s.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Dice coefficient over character pairs: 1 for the same text, 0 for nothing shared */
export function similarity(a: string, b: string): number {
  const x = bigrams(a.trim());
  const y = bigrams(b.trim());
  let total = 0;
  for (const n of x.values()) total += n;
  for (const n of y.values()) total += n;
  if (total === 0) return a.trim() === b.trim() ? 1 : 0;
  let shared = 0;
  for (const [pair, n] of x) shared += Math.min(n, y.get(pair) ?? 0);
  return (2 * shared) / total;
}

/**
 * The file's lines nearest to `oldText`, or null when nothing is close. The
 * search is for oldText's longest line (a blank line or a brace says little
 * about where it is); the lines shown start where oldText would start.
 */
export function closestLines(
  content: string,
  oldText: string
): ClosestLines | null {
  const fileLines = content.replace(/\r\n/g, "\n").split("\n");
  if (fileLines.length > MAX_FILE_LINES) return null;
  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
  let anchor = 0;
  for (let i = 1; i < oldLines.length; i++) {
    if (oldLines[i]!.trim().length > oldLines[anchor]!.trim().length) {
      anchor = i;
    }
  }
  if (!oldLines[anchor]!.trim()) return null;

  let best = -1;
  let bestScore = MIN_SIMILARITY;
  for (let i = 0; i < fileLines.length; i++) {
    const score = similarity(oldLines[anchor]!, fileLines[i]!);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best === -1) return null;

  const start = Math.max(0, best - anchor);
  const count = Math.min(Math.max(oldLines.length, 1), MAX_LINES);
  const shown = fileLines
    .slice(start, start + count)
    .map((line) =>
      line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line
    );
  return { line: start + 1, text: shown.join("\n") };
}
