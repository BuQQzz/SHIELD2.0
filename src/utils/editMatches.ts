/**
 * Edit Matches
 *
 * An edit_file whose oldText is in the file more than once changes the
 * first match only. Bonsai 2 27B anchored an edit on a Pet Supplies block
 * that all three kits share: the 72-hour kit's lost its lines, the new
 * section landed mid-file, and the answer said done (2026-10-29 in the
 * user's chat, again 2026-10-30 in a test run). Such an edit is sent back
 * before it runs.
 */

export interface AmbiguousEdit {
  /** 1-based number of the edit in the call */
  edit: number;
  /** 1-based line of each place oldText starts */
  lines: number[];
}

/** Every place `text` starts in `content` */
function indexesOf(content: string, text: string): number[] {
  const found: number[] = [];
  for (
    let at = content.indexOf(text);
    at !== -1;
    at = content.indexOf(text, at + 1)
  ) {
    found.push(at);
  }
  return found;
}

const lineAt = (content: string, index: number) =>
  content.slice(0, index).split("\n").length;

/**
 * The first edit whose oldText matches more than one place, with the
 * edits before it applied in turn as the tool would; null when every
 * oldText matches once or not at all (a miss has its own error and hint).
 */
export function ambiguousEdit(
  content: string,
  edits: unknown[]
): AmbiguousEdit | null {
  let text = content.replace(/\r\n/g, "\n");
  for (const [i, raw] of edits.entries()) {
    const edit = raw as { oldText?: unknown; newText?: unknown };
    if (typeof edit?.oldText !== "string" || !edit.oldText) continue;
    const oldText = edit.oldText.replace(/\r\n/g, "\n");
    const at = indexesOf(text, oldText);
    if (at.length > 1) {
      return { edit: i + 1, lines: at.map((index) => lineAt(text, index)) };
    }
    if (at.length === 1 && typeof edit.newText === "string") {
      text =
        text.slice(0, at[0]) +
        edit.newText +
        text.slice(at[0]! + oldText.length);
    }
  }
  return null;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A pattern for `oldText` that allows any number of blank lines where it
 * has one or more, and any trailing spaces on a line
 */
function relaxedPattern(oldText: string): RegExp {
  const lines = oldText.split("\n");
  let source = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/[ \t]+$/, "");
    if (i > 0) {
      // a run of blank lines in oldText: one or more in the file
      if (line === "" && i < lines.length - 1) {
        while (i + 1 < lines.length - 1 && lines[i + 1]!.trim() === "") i++;
        source += "(?:\\n[ \\t]*)+";
        continue;
      }
      source += "\\n";
    }
    // oldText ending in a line break: nothing after it, not the next
    // line's indentation
    if (line === "" && i === lines.length - 1) break;
    source += `${relaxedLine(line)}[ \\t]*`;
  }
  return new RegExp(source, "g");
}

/**
 * One line of oldText as a pattern: its indentation exactly (it matters in
 * Python), any run of spaces inside it as any run (column alignment), and
 * two or three quotes as two or three. g12 step 12: Bonsai 2 copied a
 * docstring's closing """ as "" five times in a row, the closest-lines
 * hint showing the right text each time; steps 9 and 10 missed on the
 * spaces that line up help text (2026-11-09).
 */
function relaxedLine(line: string): string {
  const indent = line.match(/^[ \t]*/)![0];
  const rest = line.slice(indent.length);
  let source = escapeRegex(indent);
  for (const piece of rest.split(/([ \t]+|"{2,3}|'{2,3})/)) {
    if (!piece) continue;
    if (/^[ \t]+$/.test(piece)) source += "[ \\t]+";
    else if (/^"{2,3}$/.test(piece)) source += '"{2,3}';
    else if (/^'{2,3}$/.test(piece)) source += "'{2,3}";
    else source += escapeRegex(piece);
  }
  return source;
}

/**
 * Edits whose oldText misses the file only in how many blank lines sit
 * between its lines, in trailing spaces, in runs of spaces inside a line,
 * or in "" for """, get the file's own text when
 * that matches exactly one place. Bonsai 2 sent one edit_file of 11 edits
 * with one blank line between two functions where the file had two; the
 * whole call failed, and after fixing that edit alone it rewrote the file
 * (g11 step 5, 2026-11-09). Edits are applied in turn as the tool would.
 * Null when no edit needed this.
 */
export function relaxedEdits(content: string, edits: unknown[]): unknown[] | null {
  let text = content.replace(/\r\n/g, "\n");
  let changed = false;
  const out = edits.map((raw) => {
    const edit = raw as { oldText?: unknown; newText?: unknown };
    if (typeof edit?.oldText !== "string" || !edit.oldText.trim() || typeof edit.newText !== "string") {
      return raw;
    }
    let oldText = edit.oldText.replace(/\r\n/g, "\n");
    if (!text.includes(oldText)) {
      const matches = [...text.matchAll(relaxedPattern(oldText))];
      if (matches.length !== 1) return raw;
      oldText = matches[0]![0];
      changed = true;
    }
    const at = text.indexOf(oldText);
    if (at !== -1) text = text.slice(0, at) + edit.newText + text.slice(at + oldText.length);
    return oldText === edit.oldText ? raw : { ...edit, oldText };
  });
  return changed ? out : null;
}
