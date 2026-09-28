/**
 * Qwen3-Coder writes tool arguments inside <arguments> tags and sometimes
 * escapes them as XML: the file's `"` came back as `&quot;` in an edit's
 * oldText, so the edit could not match and the fix was never made
 * (2026-09-27). The codes cannot be decoded before every edit - an HTML
 * file really contains `&quot;` - so an edit that missed is tried once more
 * with them decoded. The server writes nothing unless every edit matches,
 * so the retry changes nothing when it misses too.
 */

const ENTITY = /&(quot|apos|lt|gt|amp|#\d+|#x[0-9a-f]+);/gi;

const NAMED: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  amp: "&",
};

/** One pass, so "&amp;quot;" becomes "&quot;" and not a quote */
export function decodeXmlEntities(text: string): string {
  return text.replace(ENTITY, (whole, name: string) => {
    const lower = name.toLowerCase();
    if (lower in NAMED) return NAMED[lower];
    const code = lower.startsWith("#x")
      ? parseInt(lower.slice(2), 16)
      : parseInt(lower.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

interface Edit {
  oldText: string;
  newText: string;
}

function isEdit(value: unknown): value is Edit {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Edit).oldText === "string" &&
    typeof (value as Edit).newText === "string"
  );
}

/**
 * edit_file arguments with XML codes decoded in every oldText and newText,
 * or null when no oldText has any. newText is decoded too: a model that
 * escaped the text it copied escaped the text it wrote.
 */
export function decodeEditArguments(
  args: Record<string, unknown>
): Record<string, unknown> | null {
  const edits = args.edits;
  if (!Array.isArray(edits) || !edits.every(isEdit)) return null;
  if (!edits.some((edit) => decodeXmlEntities(edit.oldText) !== edit.oldText))
    return null;
  return {
    ...args,
    edits: edits.map((edit) => ({
      ...edit,
      oldText: decodeXmlEntities(edit.oldText),
      newText: decodeXmlEntities(edit.newText),
    })),
  };
}

export const DECODED_EDIT_NOTE =
  'Note: your oldText used codes such as &quot; where the file has plain characters, so the edit was applied with them read as plain characters. Write quotes and other characters plainly (a quote inside a JSON string is \\").';

/** The server's answer when an edit's oldText is not in the file */
export function missedEdit(result: unknown): boolean {
  const r = result as { isError?: unknown; content?: unknown } | null;
  if (!r?.isError || !Array.isArray(r.content)) return false;
  return r.content.some(
    (part) =>
      typeof (part as { text?: unknown })?.text === "string" &&
      /could not find exact match/i.test((part as { text: string }).text)
  );
}
