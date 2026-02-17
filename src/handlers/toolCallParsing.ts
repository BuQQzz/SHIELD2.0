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

function extractXmlToolCalls(content: string): ToolCallRequest[] {
  const toolCalls: ToolCallRequest[] = [];

  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  let match: RegExpExecArray | null = null;

  while ((match = toolCallRegex.exec(content)) !== null) {
    try {
      const toolCallContent = match[1]?.trim();
      if (!toolCallContent) continue;

      const serverMatch = toolCallContent.match(/<server>(.*?)<\/server>/);
      const toolMatch = toolCallContent.match(/<tool>(.*?)<\/tool>/);
      const argsMatch = toolCallContent.match(
        /<arguments>([\s\S]*?)<\/arguments>/
      );

      if (serverMatch?.[1] && toolMatch?.[1]) {
        const serverName = serverMatch[1].trim();
        const tool = toolMatch[1].trim();
        let args: Record<string, unknown> = {};

        if (argsMatch?.[1]) {
          args = parseArguments(argsMatch[1].trim());
        }

        args = normalizeFilesystemArguments(serverName, args);

        toolCalls.push({
          serverName,
          tool,
          arguments: args,
          format: "xml",
        });
        continue;
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
