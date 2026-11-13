/**
 * How much of a file a rewrite keeps
 *
 * A resent write_file was let through when it was nearly the file's size.
 * Asked to add a section, Qwen3.8 IQ1_M sent the whole 6,101-character file
 * back, retyped from its read, at 6,500 characters: it went through, and
 * the file lost lines it had and never got the section (2026-11-05). What
 * a rewrite that adds or changes a little does is keep the other lines as
 * they are.
 */

/**
 * The share of `original`'s lines that are still in `proposed`, compared
 * with outer whitespace trimmed; blank lines are not counted. 1 for a file
 * with no text.
 */
export function keptLines(original: string, proposed: string): number {
  const lines = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  const before = lines(original);
  if (before.length === 0) return 1;
  const after = new Map<string, number>();
  for (const line of lines(proposed)) {
    after.set(line, (after.get(line) ?? 0) + 1);
  }
  let kept = 0;
  for (const line of before) {
    const left = after.get(line) ?? 0;
    if (left > 0) {
      kept++;
      after.set(line, left - 1);
    }
  }
  return kept / before.length;
}
