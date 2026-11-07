/**
 * Arguments put back into the types a tool's schema asks for.
 *
 * Values recovered from a call the server ran on past its end are all text
 * (toolCallParsing.ts, splitLeakedQwenCalls): the filesystem server refused
 * read_file with `"tail": "34"` and edit_file with `edits` as a string,
 * each a call that was otherwise right (Qwen3.8 IQ1_M, 2026-11-05). Only a
 * string the schema does not take is changed, and only into the type it
 * does take; anything else is left for the server to refuse.
 */
export function argumentsForSchema(
  args: Record<string, unknown>,
  schema: Record<string, unknown> | undefined
): Record<string, unknown> {
  const properties = schema?.properties;
  if (!properties || typeof properties !== "object") return args;
  let out: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(args)) {
    if (typeof value !== "string") continue;
    const type = (properties as Record<string, { type?: unknown }>)[key]?.type;
    const converted = convert(value.trim(), type);
    if (converted === undefined) continue;
    out ??= { ...args };
    out[key] = converted;
  }
  return out ?? args;
}

function convert(text: string, type: unknown): unknown {
  if (type === "number" || type === "integer") {
    if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined;
    const n = Number(text);
    return type === "integer" && !Number.isInteger(n) ? undefined : n;
  }
  if (type === "boolean") {
    return text === "true" ? true : text === "false" ? false : undefined;
  }
  if (type === "array" || type === "object") {
    try {
      const parsed: unknown = JSON.parse(text);
      const isArray = Array.isArray(parsed);
      if (
        type === "array"
          ? isArray
          : !isArray && parsed !== null && typeof parsed === "object"
      ) {
        return parsed;
      }
    } catch {
      // not JSON: left as it is
    }
  }
  return undefined;
}

/** Arguments that hold a path, as the file tools name them */
const PATH_KEYS = new Set(["path", "source", "destination"]);

/**
 * Paths with what the model left around them cut off. With its history in
 * the template's own form, Qwen3.8 IQ1_M ended a path with a broken
 * closing tag, which the server kept in the value: ".md</", ".md</}",
 * ".md</content>" (3 of 4 edit runs); thinking, with a space (".md "),
 * and the read failed as "no such file" (2 of 4, 2026-11-06). A path never
 * holds "</" or starts or ends with whitespace, so those go; other values
 * (a file's text may end in </div>) are left alone.
 */
export function cleanPaths(
  args: Record<string, unknown>
): Record<string, unknown> {
  const cut = (value: unknown) =>
    typeof value === "string"
      ? (value.includes("</")
          ? value.slice(0, value.indexOf("</"))
          : value
        ).trim()
      : value;
  let out: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(args)) {
    const fixed =
      key === "paths" && Array.isArray(value)
        ? value.map(cut)
        : PATH_KEYS.has(key)
          ? cut(value)
          : value;
    if (
      fixed === value ||
      (Array.isArray(fixed) &&
        fixed.every((v, i) => v === (value as unknown[])[i]))
    ) {
      continue;
    }
    out ??= { ...args };
    out[key] = fixed;
  }
  return out ?? args;
}

/**
 * An edit_file edit sent in two halves put back together. Bonsai 2 27B,
 * appending a long section, wrote `edits` as [{newText}, {oldText}] twice
 * in a row; the server refused both ("expected string ... edits[0].oldText")
 * and the model gave up on edit_file for a Python script (2026-11-04). Only
 * a list made wholly of such halves, each pair one oldText and one newText,
 * is joined; anything else is left for the server to refuse.
 */
export function joinSplitEdits(
  tool: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const edits = args.edits;
  if (tool !== "edit_file" || !Array.isArray(edits) || edits.length < 2) {
    return args;
  }
  if (edits.length % 2 !== 0) return args;
  const half = (edit: unknown): "oldText" | "newText" | null => {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) return null;
    const keys = Object.keys(edit);
    if (keys.length !== 1) return null;
    const key = keys[0];
    return (key === "oldText" || key === "newText") &&
      typeof (edit as Record<string, unknown>)[key] === "string"
      ? key
      : null;
  };
  const joined: { oldText: string; newText: string }[] = [];
  for (let i = 0; i < edits.length; i += 2) {
    const a = half(edits[i]);
    const b = half(edits[i + 1]);
    if (!a || !b || a === b) return args;
    joined.push({
      ...(edits[i] as Record<string, string>),
      ...(edits[i + 1] as Record<string, string>),
    } as { oldText: string; newText: string });
  }
  return { ...args, edits: joined };
}

/** The file tools that take head or tail, but refuse both */
const RANGED_READS = new Set(["read_text_file", "read_file"]);

/**
 * A read asking for a file's first and last lines at once, made a read of
 * the whole file. The server refuses both together ("Cannot specify both
 * head and tail parameters simultaneously"): Bonsai 2 asked for both 3
 * times in two six-request sessions, checking an edit (2026-11-07). A
 * result too long for the context is cut to fit (mcpToolHandler.ts).
 */
export function oneReadRange(
  tool: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (!RANGED_READS.has(tool) || args.head == null || args.tail == null) {
    return args;
  }
  const { head: _head, tail: _tail, ...rest } = args;
  return rest;
}
