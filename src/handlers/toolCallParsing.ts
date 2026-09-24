/**
 * Tool Call Parsing
 *
 * Parses OpenAI-style and XML-style tool calls into a normalized request shape.
 */

export interface ToolCallRequest {
  serverName: string;
  tool: string;
  arguments: Record<string, unknown>;
  callId?: string;
  format?: "xml" | "openai";
  /**
   * Set when the model supplied arguments that could not be parsed. The call
   * must not run: executing it with `{}` makes the tool report a missing
   * parameter and hides the real problem from the model.
   */
  argumentsError?: string;
}

/** Set on the stand-in for a call the reply ended in the middle of */
export const CUT_OFF_ERROR_PREFIX = "The tool call was cut off";

export interface ExtractToolCallOptions {
  enableOpenAIToolCalls?: boolean;
  enableXmlToolCalls?: boolean;
}

interface ToolCallJsonObject {
  id?: string;
  function?: {
    name?: string;
    arguments?: unknown;
  };
  name?: string;
  arguments?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const VALID_JSON_ESCAPES = `"\\/bfnrtu`;

/**
 * Make string literals in almost-JSON legal.
 *
 * Models writing multi-line values (file content, edit_file oldText/newText)
 * routinely put raw line breaks inside JSON strings, and sometimes single
 * backslashes in Windows paths. Both make JSON.parse throw. Only characters
 * inside string literals are touched, so structure is never rewritten.
 */
export function repairJsonStrings(input: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }

    if (ch === "\\") {
      const next = input[i + 1];
      if (next !== undefined && VALID_JSON_ESCAPES.includes(next)) {
        out += ch + next;
        i++;
      } else {
        out += "\\\\"; // stray backslash, e.g. C:\Users
      }
      continue;
    }

    if (ch === '"') {
      inString = false;
      out += ch;
    } else if (ch === "\n") {
      out += "\\n";
    } else if (ch === "\r") {
      out += "\\r";
    } else if (ch === "\t") {
      out += "\\t";
    } else {
      out += ch;
    }
  }

  return out;
}

/**
 * What may follow a quote that really closes a string: the end, `}`, `]`,
 * `:`, or a comma and then another value. `, "b")` is not a next value, so
 * the quotes in `f("a", "b")` stay text.
 */
const AFTER_CLOSING_QUOTE =
  /^\s*(?:$|[}\]:]|,\s*(?:"[^"\\\n]*"\s*[:,\]}]|[{[\-\d]|true|false|null))/;

/**
 * Escape double quotes that sit inside a string value.
 *
 * Writing a whole source file as a JSON string, Qwen3-Coder escaped most
 * quotes but not those in HTML inside JS template literals:
 * `<img src="${item.url}" alt="${item.title}">`. The first bare quote ended
 * the string and the call failed twice (write_file and edit_file of app.js,
 * 2026-09-24). A quote counts as closing only when valid JSON can follow it.
 * Used only after a strict parse and repairJsonStrings have both failed.
 */
export function escapeStrayQuotes(input: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (!inString) {
      if (ch === '"') inString = true;
      out += ch;
      continue;
    }

    if (ch === "\\") {
      out += ch + (input[i + 1] ?? "");
      i++;
      continue;
    }

    if (ch === '"') {
      if (AFTER_CLOSING_QUOTE.test(input.slice(i + 1, i + 200))) {
        inString = false;
        out += ch;
      } else {
        out += '\\"';
      }
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * A complete JSON object or array followed only by stray closing brackets,
 * with the strays removed; otherwise null.
 *
 * Qwen3-Coder ended three write_file calls in a row with `..."}\n}` - valid
 * arguments plus one extra brace. Told "not valid JSON", it sent the same
 * call again each time (setup.sh, setup.bat, 2026-09-24).
 */
export function dropTrailingClosers(input: string): string | null {
  const text = input.trim();
  if (text[0] !== "{" && text[0] !== "[") return null;

  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        const rest = text.slice(i + 1);
        return /^[\s}\]]+$/.test(rest) ? text.slice(0, i + 1) : null;
      }
    }
  }
  return null;
}

function parseJson(input: string): unknown | null {
  const repaired = repairJsonStrings(input);
  const candidates = [input, repaired, escapeStrayQuotes(repaired)];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next repair
    }
  }
  for (const candidate of candidates) {
    const trimmed = dropTrailingClosers(candidate);
    if (trimmed === null) continue;
    try {
      return JSON.parse(trimmed);
    } catch {
      // try the next repair
    }
  }
  return null;
}

function parseArguments(value: unknown): {
  args: Record<string, unknown>;
  error?: string;
} {
  if (value === undefined || value === null) {
    return { args: {} };
  }

  if (isRecord(value) && !Array.isArray(value)) {
    return { args: value };
  }

  if (typeof value === "string") {
    if (value.trim() === "") {
      return { args: {} };
    }
    const parsed = parseJson(value);
    if (isRecord(parsed) && !Array.isArray(parsed)) {
      return { args: parsed };
    }
    return {
      args: {},
      error: "The tool call arguments were not valid JSON.",
    };
  }

  return {
    args: {},
    error: "The tool call arguments must be a JSON object.",
  };
}

function normalizeToolNameAndServer(name: string): {
  serverName: string;
  tool: string;
} {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { serverName: "filesystem", tool: "" };
  }

  const dotIndex = trimmedName.indexOf(".");
  if (dotIndex > 0 && dotIndex < trimmedName.length - 1) {
    return {
      serverName: trimmedName.slice(0, dotIndex),
      tool: trimmedName.slice(dotIndex + 1),
    };
  }

  return {
    serverName: "filesystem",
    tool: trimmedName,
  };
}

function normalizeFilesystemPath(pathValue: string): string {
  const normalized = pathValue.replace(/\//g, "\\");

  const publicDesktopMatch = normalized.match(
    /^C:\\Users\\Public\\Desktop(\\.*)?$/i
  );
  if (publicDesktopMatch) {
    return `~\\Desktop${publicDesktopMatch[1] ?? ""}`;
  }

  const publicDocumentsMatch = normalized.match(
    /^C:\\Users\\Public\\Documents(\\.*)?$/i
  );
  if (publicDocumentsMatch) {
    return `~\\Documents${publicDocumentsMatch[1] ?? ""}`;
  }

  return pathValue;
}

/** Key pairs models use for an edit, as [text to find, replacement] */
const EDIT_KEY_ALIASES: Array<[string, string]> = [
  ["replace", "with"],
  ["search", "replace"],
  ["find", "replace"],
  ["old", "new"],
  ["old_text", "new_text"],
  ["oldString", "newString"],
  ["old_string", "new_string"],
];

/**
 * Map an edit written with made-up keys onto edit_file's oldText/newText.
 *
 * Qwen3-Coder wrote {"replace": old, "with": new} every time; the server
 * rejected it, and the model fell back to rewriting the whole file with
 * write_file (index.html and styles.css, 2026-09-24). An edit that already
 * has oldText or newText, or matches no known pair, is left as it is.
 */
function normalizeEdit(edit: unknown): unknown {
  if (!isRecord(edit) || "oldText" in edit || "newText" in edit) return edit;
  for (const [from, to] of EDIT_KEY_ALIASES) {
    if (typeof edit[from] === "string" && typeof edit[to] === "string") {
      const { [from]: oldText, [to]: newText, ...rest } = edit;
      return { ...rest, oldText, newText };
    }
  }
  return edit;
}

function normalizeFilesystemArguments(
  serverName: string,
  args: Record<string, unknown>,
  tool?: string
): Record<string, unknown> {
  if (serverName !== "filesystem") {
    return args;
  }

  const normalizedArgs = { ...args };
  if (typeof normalizedArgs.path === "string") {
    normalizedArgs.path = normalizeFilesystemPath(normalizedArgs.path);
  }
  if (tool === "edit_file" && Array.isArray(normalizedArgs.edits)) {
    normalizedArgs.edits = normalizedArgs.edits.map(normalizeEdit);
  }

  return normalizedArgs;
}

function parseXmlAttributes(input: string): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = null;

  while ((match = attrRegex.exec(input)) !== null) {
    const key = match[1];
    if (!key) {
      continue;
    }
    const value = match[2] ?? match[3] ?? "";
    attributes[key] = value;
  }

  return attributes;
}

function parseOpenAIToolCall(item: ToolCallJsonObject): ToolCallRequest | null {
  const name = item.function?.name ?? item.name;
  if (!name || typeof name !== "string") {
    return null;
  }

  const { args, error } = parseArguments(
    item.function?.arguments ?? item.arguments
  );
  const { serverName, tool } = normalizeToolNameAndServer(name);
  if (!tool) {
    return null;
  }

  const normalizedArgs = normalizeFilesystemArguments(serverName, args, tool);

  return {
    serverName,
    tool,
    arguments: normalizedArgs,
    callId: item.id,
    format: "openai",
    ...(error ? { argumentsError: error } : {}),
  };
}

/**
 * Whether a JSON object is shaped like a tool call rather than ordinary data.
 *
 * Models routinely quote JSON in their answers (a config file, package.json).
 * Treating every object with a "name" key as a call ran a phantom tool named
 * after the data, e.g. `orchid` from `{"name": "orchid", "port": 48213}`.
 * Outside an explicit tool_calls array, a call must be wrapped in `function`
 * or carry `arguments` next to `name`.
 */
function isCallShaped(item: ToolCallJsonObject, inToolCalls: boolean): boolean {
  if (isRecord(item.function)) return true;
  return inToolCalls || "arguments" in item;
}

function extractOpenAIToolCallsFromPayload(
  payload: unknown,
  inToolCalls = false
): ToolCallRequest[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) =>
        isRecord(item) && isCallShaped(item, inToolCalls)
          ? parseOpenAIToolCall(item)
          : null
      )
      .filter((toolCall): toolCall is ToolCallRequest => toolCall !== null);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const toolCalls = payload.tool_calls;
  if (Array.isArray(toolCalls)) {
    return extractOpenAIToolCallsFromPayload(toolCalls, true);
  }

  if (!isCallShaped(payload, false)) {
    return [];
  }
  const parsed = parseOpenAIToolCall(payload);
  return parsed ? [parsed] : [];
}

function extractOpenAIToolCalls(content: string): ToolCallRequest[] {
  const toolCalls: ToolCallRequest[] = [];
  const candidates: string[] = [];

  const jsonCodeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let jsonBlockMatch: RegExpExecArray | null = null;

  while ((jsonBlockMatch = jsonCodeBlockRegex.exec(content)) !== null) {
    const jsonBlock = jsonBlockMatch[1]?.trim();
    if (jsonBlock) {
      candidates.push(jsonBlock);
    }
  }

  const trimmedContent = content.trim();
  if (trimmedContent.startsWith("{") || trimmedContent.startsWith("[")) {
    candidates.push(trimmedContent);
  }

  for (const candidate of candidates) {
    const parsedCandidate = parseJson(candidate);
    if (parsedCandidate === null) {
      continue;
    }

    const parsedToolCalls = extractOpenAIToolCallsFromPayload(parsedCandidate);
    if (parsedToolCalls.length > 0) {
      toolCalls.push(...parsedToolCalls);
    }
  }

  return toolCalls;
}

/**
 * Put back a missing <tool_call> opener.
 *
 * Models routinely emit the call body and the closing tag without the opener,
 * especially after a few turns of conversation. The strict regex then matches
 * nothing, so the call silently never runs and the user sees raw XML sitting
 * in the chat with no effect. Repairing the markup here keeps that variance
 * out of the rest of the pipeline.
 */
/**
 * Wrap call bodies that have no <tool_call> tags at all.
 *
 * Qwen2.5 sometimes writes the body alone inside a ```markdown fence
 * (agent benchmark, 2026-09-22). Only the full body shape is matched - a
 * <tool> element followed by a closed <arguments> element, optionally
 * preceded by <server> - so prose that mentions a tag is left alone.
 */
const BARE_CALL_BODY =
  /(?:<server>[^<]*<\/server>\s*)?<tool>[^<]+<\/tool>\s*<arguments>[\s\S]*?<\/arguments>/g;

function wrapBareCallBodies(text: string): string {
  if (text.includes("<tool_call>")) return text;
  return text.replace(
    BARE_CALL_BODY,
    (body) => `<tool_call>\n${body}\n</tool_call>`
  );
}

export function repairToolCallMarkup(content: string): string {
  const CLOSE = "</tool_call>";
  const OPEN = "<tool_call>";

  let output = "";
  let rest = content;

  for (;;) {
    const closeIndex = rest.indexOf(CLOSE);
    if (closeIndex === -1) {
      output += wrapBareCallBodies(rest);
      break;
    }

    const segment = rest.slice(0, closeIndex);
    rest = rest.slice(closeIndex + CLOSE.length);

    if (segment.includes(OPEN)) {
      // Already well formed
      output += segment + CLOSE;
      continue;
    }

    // The body sits immediately before the closing tag, and starts at
    // <server> when there is one - <tool> comes after it, so picking the
    // later index would cut the server name off the front of the call.
    const serverIndex = segment.lastIndexOf("<server>");
    const toolIndex = segment.lastIndexOf("<tool>");
    const bodyStart = serverIndex !== -1 ? serverIndex : toolIndex;

    if (bodyStart === -1) {
      // A stray closing tag with no body - drop the tag, keep the text
      output += segment;
      continue;
    }

    output +=
      segment.slice(0, bodyStart) + OPEN + segment.slice(bodyStart) + CLOSE;
  }

  return output;
}

/**
 * Parse an <arguments> body that holds nested elements instead of JSON:
 *
 *   <arguments>
 *     <path>C:\Users\me\Desktop</path>
 *   </arguments>
 *
 * Returns null when the body has no child elements, so the caller can fall
 * back to JSON parsing.
 */
function parseXmlArgumentElements(
  body: string
): Record<string, unknown> | null {
  const elementRegex = /<([a-zA-Z_][\w-]*)>([\s\S]*?)<\/\1>/g;
  const args: Record<string, unknown> = {};
  let found = false;
  let match: RegExpExecArray | null = null;

  while ((match = elementRegex.exec(body)) !== null) {
    const key = match[1];
    if (!key) continue;
    args[key] = (match[2] ?? "").trim();
    found = true;
  }

  return found ? args : null;
}

function extractXmlToolCalls(rawContent: string): ToolCallRequest[] {
  const toolCalls: ToolCallRequest[] = [];
  const content = repairToolCallMarkup(rawContent);

  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match: RegExpExecArray | null = null;

  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const toolCallContent = match[1]?.trim();
      if (!toolCallContent) continue;

      const serverMatch = toolCallContent.match(/<server>(.*?)<\/server>/);
      // Models use <tool> or <name> interchangeably, and <name> may carry a
      // dotted "server.tool" rather than a separate <server> element.
      const toolMatch =
        toolCallContent.match(/<tool>(.*?)<\/tool>/) ??
        toolCallContent.match(/<name>(.*?)<\/name>/);
      // The closing </arguments> is often left out, with the JSON running
      // straight into </tool_call>. Requiring it silently produced `{}`.
      const argsMatch = toolCallContent.match(
        /<arguments>([\s\S]*?)(?:<\/arguments>|$)/
      );

      if (toolMatch?.[1]) {
        const rawName = toolMatch[1].trim();
        const named = normalizeToolNameAndServer(rawName);
        const serverName = serverMatch?.[1]?.trim() || named.serverName;
        const tool = named.tool;

        let args: Record<string, unknown> = {};
        let argumentsError: string | undefined;
        if (argsMatch?.[1]) {
          const body = argsMatch[1].trim();
          // A JSON body is JSON even when a value holds markup: the HTML in
          // a write_file content string was read as <head>/<body> arguments
          // and the path was lost. Nested elements only otherwise.
          const elements = body.startsWith("{")
            ? null
            : parseXmlArgumentElements(body);
          if (elements) {
            args = elements;
          } else {
            ({ args, error: argumentsError } = parseArguments(body));
          }
        }

        if (tool) {
          args = normalizeFilesystemArguments(serverName, args, tool);

          toolCalls.push({
            serverName,
            tool,
            arguments: args,
            format: "xml",
            ...(argumentsError ? { argumentsError } : {}),
          });
          continue;
        }
      }

      const shorthandMatch = toolCallContent.match(
        /^<([a-zA-Z_][\w-]*)([^>]*)>([\s\S]*?)<\/\1>$/
      );

      if (shorthandMatch) {
        const toolMatchValue = shorthandMatch[1];
        if (!toolMatchValue) {
          continue;
        }

        const tool = toolMatchValue.trim();
        const rawAttributes = shorthandMatch[2] ?? "";
        const body = shorthandMatch[3] ?? "";

        const args = parseXmlAttributes(rawAttributes);
        if (tool === "write_file") {
          args.content = body;
        }

        const normalizedArgs = normalizeFilesystemArguments(
          "filesystem",
          args,
          tool
        );

        toolCalls.push({
          serverName: "filesystem",
          tool,
          arguments: normalizedArgs,
          format: "xml",
        });
      }
    } catch (error) {
      console.error("[MCPToolHandler] Error parsing XML tool call:", error);
    }
  }

  return toolCalls;
}

function deduplicateToolCalls(toolCalls: ToolCallRequest[]): ToolCallRequest[] {
  const seen = new Set<string>();

  return toolCalls.filter((toolCall) => {
    const key = `${toolCall.serverName}:${toolCall.tool}:${JSON.stringify(toolCall.arguments)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function extractToolCalls(
  content: string,
  options: ExtractToolCallOptions = {}
): ToolCallRequest[] {
  // No logging here: the UI calls this while rendering, i.e. on every
  // streamed token. processMCPToolCalls logs the calls it actually runs.
  const enableOpenAIToolCalls = options.enableOpenAIToolCalls ?? true;
  const enableXmlToolCalls = options.enableXmlToolCalls ?? true;

  const openAIToolCalls = enableOpenAIToolCalls
    ? extractOpenAIToolCalls(content)
    : [];
  const xmlToolCalls = enableXmlToolCalls ? extractXmlToolCalls(content) : [];
  return deduplicateToolCalls([...openAIToolCalls, ...xmlToolCalls]);
}

/**
 * Remove tool call markup from text destined for the UI.
 *
 * The raw content still has to reach `extractToolCalls`, so this is applied
 * only when rendering. Without it the user sees the XML the model emitted,
 * which is machine plumbing, not conversation.
 *
 * Tolerates a missing opening tag: models sometimes emit the body and the
 * closing tag without the opener, and leaving that half-call on screen looks
 * like a bug even though the call itself never ran.
 */
export function stripToolCallMarkup(content: string): string {
  return (
    content
      // Well-formed calls
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
      // Opener with no closer (truncated generation)
      .replace(/<tool_call>[\s\S]*$/g, "")
      // Body and closer with no opener
      .replace(/<server>[\s\S]*?<\/tool_call>/g, "")
      // Body with neither tag - the parser runs these (wrapBareCallBodies)
      .replace(BARE_CALL_BODY, "")
      // OpenAI-style call emitted in a fenced block
      .replace(/```(?:json)?\s*\{\s*"tool_calls"[\s\S]*?```/g, "")
      // A code fence the call was written in, now empty
      .replace(/```[a-z]*\s*```/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Where a tool call that is still being written starts */
const CALL_START =
  /<tool_call|<server>|<tool>|<name>|```json\s*\{\s*"tool_calls"/;

/**
 * What to show while a reply is still streaming.
 *
 * stripToolCallMarkup only recognises a call once its tags are complete, so
 * mid-generation the user saw raw `<tool_ca…` or `<server>filesystem…` text
 * that then vanished into a tool row. Everything from the start of an
 * unfinished call is held back instead, and `pendingTool` says a call is
 * coming (its name once written, "" before that, null when there is none).
 */
export function streamingToolCallPreview(content: string): {
  text: string;
  pendingTool: string | null;
  /** The call's path once written, so the UI can say "Writing app.js" */
  pendingTarget?: string;
} {
  const CLOSE = "</tool_call>";
  const lastClose = content.lastIndexOf(CLOSE);
  const searchFrom = lastClose === -1 ? 0 : lastClose + CLOSE.length;
  const relative = content.slice(searchFrom).search(CALL_START);

  if (relative === -1) {
    return {
      // A tag still being typed at the very end, e.g. "<tool_ca"
      text: stripToolCallMarkup(content)
        .replace(/<[a-z_]*$/i, "")
        .trimEnd(),
      pendingTool: null,
    };
  }

  const start = searchFrom + relative;
  const unfinished = content.slice(start);
  const name =
    unfinished.match(/<(?:tool|name)>([^<]+)<\//)?.[1]?.trim() ??
    unfinished.match(/"name"\s*:\s*"([^"]+)"/)?.[1] ??
    "";

  const target = unfinished.match(/"(?:path|source)"\s*:\s*"([^"]+)"/)?.[1];

  return {
    text: stripToolCallMarkup(content.slice(0, start))
      .replace(/```[a-z]*\s*$/i, "") // fence opened for the call
      .trimEnd(),
    pendingTool: name.includes(".") ? name.split(".").pop()! : name,
    ...(target ? { pendingTarget: target } : {}),
  };
}

/**
 * A stand-in for a call the reply stopped in the middle of, or null.
 *
 * A reply that reaches its token limit while writing a file ends inside the
 * call's arguments. No complete call can be parsed from it, so the turn just
 * ended: "Now let's enhance app.js:" and nothing happened (Qwen3-Coder,
 * edit_file carrying the whole file, 3328/3328 tokens, 2026-09-24). The
 * stand-in never runs; it carries an error telling the model what happened.
 *
 * Only a call that reached its arguments counts, so prose that merely
 * mentions a tag is not mistaken for one.
 */
export function cutOffToolCall(content: string): ToolCallRequest | null {
  const { pendingTool } = streamingToolCallPreview(content);
  if (pendingTool === null) return null;

  const CLOSE = "</tool_call>";
  const lastClose = content.lastIndexOf(CLOSE);
  const tail = content.slice(lastClose === -1 ? 0 : lastClose + CLOSE.length);
  if (!/<arguments>|"arguments"\s*:/.test(tail)) return null;

  const tool = pendingTool || "tool";
  return {
    serverName: "filesystem",
    tool,
    arguments: {},
    format: "xml",
    argumentsError: `${CUT_OFF_ERROR_PREFIX}: your reply reached its length limit partway through the ${tool} arguments, so it was not run and nothing changed. Do it in smaller steps: create a large file in parts (write_file with the first part, then edit_file to add each next part), and change existing files with edit_file using only the lines that change.`,
  };
}
