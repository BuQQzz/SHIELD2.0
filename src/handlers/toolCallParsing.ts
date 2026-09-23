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

function parseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    try {
      return JSON.parse(repairJsonStrings(input));
    } catch {
      return null;
    }
  }
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

function normalizeFilesystemArguments(
  serverName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (serverName !== "filesystem") {
    return args;
  }

  const normalizedArgs = { ...args };
  if (typeof normalizedArgs.path === "string") {
    normalizedArgs.path = normalizeFilesystemPath(normalizedArgs.path);
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

  const normalizedArgs = normalizeFilesystemArguments(serverName, args);

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
          // Nested elements first, then JSON
          const elements = parseXmlArgumentElements(body);
          if (elements) {
            args = elements;
          } else {
            ({ args, error: argumentsError } = parseArguments(body));
          }
        }

        if (tool) {
          args = normalizeFilesystemArguments(serverName, args);

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

        const normalizedArgs = normalizeFilesystemArguments("filesystem", args);

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
  console.log(
    "[MCPToolHandler] Extracting tool calls from content:",
    content.substring(0, 200)
  );

  const enableOpenAIToolCalls = options.enableOpenAIToolCalls ?? true;
  const enableXmlToolCalls = options.enableXmlToolCalls ?? true;

  const openAIToolCalls = enableOpenAIToolCalls
    ? extractOpenAIToolCalls(content)
    : [];
  const xmlToolCalls = enableXmlToolCalls ? extractXmlToolCalls(content) : [];
  const toolCalls = deduplicateToolCalls([...openAIToolCalls, ...xmlToolCalls]);

  console.log("[MCPToolHandler] OpenAI tool calls:", openAIToolCalls.length);
  console.log("[MCPToolHandler] XML tool calls:", xmlToolCalls.length);
  console.log("[MCPToolHandler] Total tool calls extracted:", toolCalls.length);

  return toolCalls;
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

  return {
    text: stripToolCallMarkup(content.slice(0, start))
      .replace(/```[a-z]*\s*$/i, "") // fence opened for the call
      .trimEnd(),
    pendingTool: name.includes(".") ? name.split(".").pop()! : name,
  };
}
