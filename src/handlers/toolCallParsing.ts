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

function parseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = parseJson(value);
    if (isRecord(parsed)) {
      return parsed;
    }
  }

  return {};
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

  const args = parseArguments(item.function?.arguments ?? item.arguments);
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
  };
}

function extractOpenAIToolCallsFromPayload(
  payload: unknown
): ToolCallRequest[] {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => (isRecord(item) ? parseOpenAIToolCall(item) : null))
      .filter((toolCall): toolCall is ToolCallRequest => toolCall !== null);
  }

  if (!isRecord(payload)) {
    return [];
  }

  const toolCalls = payload.tool_calls;
  if (Array.isArray(toolCalls)) {
    return extractOpenAIToolCallsFromPayload(toolCalls);
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
export function repairToolCallMarkup(content: string): string {
  const CLOSE = "</tool_call>";
  const OPEN = "<tool_call>";

  let output = "";
  let rest = content;

  for (;;) {
    const closeIndex = rest.indexOf(CLOSE);
    if (closeIndex === -1) {
      output += rest;
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
      const argsMatch = toolCallContent.match(
        /<arguments>([\s\S]*?)<\/arguments>/
      );

      if (toolMatch?.[1]) {
        const rawName = toolMatch[1].trim();
        const named = normalizeToolNameAndServer(rawName);
        const serverName = serverMatch?.[1]?.trim() || named.serverName;
        const tool = named.tool;

        let args: Record<string, unknown> = {};
        if (argsMatch?.[1]) {
          const body = argsMatch[1].trim();
          // Nested elements first, then JSON
          args = parseXmlArgumentElements(body) ?? parseArguments(body);
        }

        if (tool) {
          args = normalizeFilesystemArguments(serverName, args);

          toolCalls.push({
            serverName,
            tool,
            arguments: args,
            format: "xml",
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
      // OpenAI-style call emitted in a fenced block
      .replace(/```(?:json)?\s*\{\s*"tool_calls"[\s\S]*?```/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
