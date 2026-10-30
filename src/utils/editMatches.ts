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
