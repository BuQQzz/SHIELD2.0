/**
 * What an edit or a write will do to a file, as lines the permission bar can
 * show before the user decides: the text taken out and the text put in.
 */

const MAX_EDITS = 3;
const MAX_LINES = 8;

export interface EditPreview {
  /** Lines that go, and lines that replace them */
  removed: string[];
  added: string[];
  /** Lines left out of each side to keep the bar short */
  hiddenRemoved: number;
  hiddenAdded: number;
}

export type ChangePreview =
  | { kind: "edit"; edits: EditPreview[]; moreEdits: number }
  | { kind: "write"; lines: string[]; hiddenLines: number; chars: number };

function toLines(text: string): string[] {
  if (text === "") return [];
  return text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

function clip(lines: string[]): [string[], number] {
  return [lines.slice(0, MAX_LINES), Math.max(0, lines.length - MAX_LINES)];
}

/** Null for a tool that changes no file text, or a call with nothing to show */
export function changePreview(
  tool: string,
  args: Record<string, unknown>
): ChangePreview | null {
  if (tool === "edit_file" && Array.isArray(args.edits)) {
    const edits: EditPreview[] = [];
    for (const entry of args.edits) {
      const edit = entry as { oldText?: unknown; newText?: unknown };
      if (typeof edit?.oldText !== "string") continue;
      const [removed, hiddenRemoved] = clip(toLines(edit.oldText));
      const [added, hiddenAdded] = clip(
        toLines(typeof edit.newText === "string" ? edit.newText : "")
      );
      edits.push({ removed, added, hiddenRemoved, hiddenAdded });
    }
    if (edits.length === 0) return null;
    return {
      kind: "edit",
      edits: edits.slice(0, MAX_EDITS),
      moreEdits: Math.max(0, edits.length - MAX_EDITS),
    };
  }
  if (tool === "write_file" && typeof args.content === "string") {
    const [lines, hiddenLines] = clip(toLines(args.content));
    return { kind: "write", lines, hiddenLines, chars: args.content.length };
  }
  return null;
}
