/**
 * search_memory and open_memory: the model's way into SHIELD's memory of
 * past conversations, served as the "memory" server next to the file, web
 * and terminal tools. Both only read, so they run in every mode without
 * asking. Each call returns a little - a few one-line matches, or one
 * message - so a model with a small context can still find its way back
 * to earlier work, one step at a time.
 */

import type { MCPToolResult } from "../MCPServerConfig.js";
import { formatSearchResults, hitLine } from "./memoryEntries.js";
import type { MemoryIndex, MemoryRecord } from "./memoryIndex.js";

export const MEMORY_SERVER_NAME = "memory";
export const SEARCH_MEMORY_TOOL_NAME = "search_memory";
export const OPEN_MEMORY_TOOL_NAME = "open_memory";

const MAX_RESULTS = 8;
const DEFAULT_RESULTS = 5;

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const MEMORY_TOOLS = [
  {
    name: SEARCH_MEMORY_TOOL_NAME,
    description:
      'Search SHIELD\'s memory of the user\'s earlier conversations - every chat and code session: what the user asked, what was answered, which files were changed and which commands ran. Use it when the user refers to earlier work ("like last time", "the bug we fixed", "what did we decide"), or when you need something from before that is no longer in your context. Returns a few short matches, each with an id; read one with open_memory.',
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A few distinctive words: a file name, an error, a feature, what the user called it",
        },
        limit: {
          type: "number",
          description: `How many matches (default ${DEFAULT_RESULTS}, at most ${MAX_RESULTS})`,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: OPEN_MEMORY_TOOL_NAME,
    description:
      "Read one match from search_memory in full, with the user's request it answered.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            'The id from search_memory, e.g. "conv-1790548265742-3kks3x3wp#14"',
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
];

export function isMemoryTool(name: string): boolean {
  return name === SEARCH_MEMORY_TOOL_NAME || name === OPEN_MEMORY_TOOL_NAME;
}

const text = (message: string): MCPToolResult => ({
  success: true,
  data: { content: [{ type: "text", text: message }] },
});

const fail = (error: string): MCPToolResult => ({ success: false, error });

/** An opened memory: where it is from, the request, then the message */
export function formatRecord(record: MemoryRecord): string {
  const line = hitLine({
    ...record,
    snippet: "",
    score: 0,
    matched: 0,
  }).replace(/: $/, "");
  const parts = [line];
  if (record.request) parts.push("", `The user's request:`, record.request);
  parts.push(
    "",
    record.role === "user"
      ? "The user wrote:"
      : record.role === "assistant"
        ? "The message (what was said at the time):"
        : "The message:",
    record.text
  );
  if (record.record?.length) {
    parts.push(
      "",
      "What SHIELD's record shows actually happened to the files above, from the tools' results - where this and the message differ, the record is right:",
      ...record.record.map((line) => `- ${line}`)
    );
  }
  return parts.join("\n");
}

/** Run a memory tool. Never throws: failures come back as tool errors. */
export async function runMemoryTool(
  tool: string,
  args: Record<string, unknown>,
  index: MemoryIndex
): Promise<MCPToolResult> {
  try {
    if (tool === SEARCH_MEMORY_TOOL_NAME) {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) return fail('search_memory needs a "query"');
      const limit =
        typeof args.limit === "number" && args.limit > 0
          ? Math.min(MAX_RESULTS, Math.round(args.limit))
          : DEFAULT_RESULTS;
      // The current conversation is searched too: its oldest turns may have
      // been cleared from the model's context
      const hits = await index.search(query, { limit });
      const notDone = await index.notDoneFor(
        hits.map((hit) => hit.conversationId)
      );
      return text(formatSearchResults(query, hits, notDone));
    }
    if (tool === OPEN_MEMORY_TOOL_NAME) {
      const id =
        typeof args.id === "string"
          ? args.id.trim().replace(/^\[|\]$/g, "")
          : "";
      if (!id) return fail('open_memory needs an "id" from search_memory');
      const record = await index.read(id);
      if (!record) {
        return fail(
          `There is no memory with the id "${id}". Use an id exactly as search_memory gave it.`
        );
      }
      return text(formatRecord(record));
    }
    return fail(`There is no memory tool called '${tool}'`);
  } catch (error) {
    return fail(
      `Memory is not available right now: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
