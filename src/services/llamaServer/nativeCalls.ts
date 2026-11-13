/**
 * Native tool calls on llama-server (main process only)
 *
 * For a model whose catalog entry sets nativeToolCalls, the tools go to the
 * server as OpenAI function definitions. The server then holds every call
 * to its tool's schema with a grammar from the call marker on, so a call
 * cannot be malformed; nearly every Bonsai failure had been one. 9 of 9
 * test calls came back valid, file writes of 4k characters with quotes and
 * backslashes included (2026-10-29, docs/HANDOFF.md).
 *
 * The calls are written into the reply as SHIELD's own text form as they
 * stream, so everything after (the tool loop, history, clearing, the live
 * preview and the loop guard) works as for any model. The model takes that
 * history fine: 3 of 3 next calls were valid with it, as with the
 * structured form.
 */

import type { ToolDefinition } from "../../types/prompts.js";

export interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * The tools as llama-server takes them: plain names, the first of a name
 * wins, in fewer words.
 *
 * They are sent with every request, and were three quarters of its fixed
 * part: 14,377 characters for 22 tools beside a 4,220-character system
 * prompt, ~3,100 tokens of an 8k window before any work (Qwen3.8 27B,
 * 2026-11-05). The filesystem server's descriptions repeat what the name
 * and schema say, and three of its tools do another's job, so they are
 * left out here; a call to one is still decided by the policy as before.
 */
export function openAiTools(tools: ToolDefinition[]): OpenAiTool[] {
  const seen = new Set<string>();
  const out: OpenAiTool[] = [];
  for (const tool of tools) {
    if (seen.has(tool.name) || LEFT_OUT.has(tool.name)) continue;
    seen.add(tool.name);
    const filesystem = (tool.serverName ?? "filesystem") === "filesystem";
    out.push({
      type: "function",
      function: {
        name: tool.name,
        description:
          (filesystem && SHORT_DESCRIPTIONS[tool.name]) || tool.description,
        parameters: withoutSchemaUri(
          tool.inputSchema ?? schemaFromParameters(tool)
        ),
      },
    });
  }
  return out;
}

/**
 * read_file is read_text_file under its old name; read_media_file returns
 * images, and no vision projector is loaded; list_directory_with_sizes is
 * list_directory with sizes, which get_file_info gives
 */
const LEFT_OUT = new Set([
  "read_file",
  "read_media_file",
  "list_directory_with_sizes",
]);

/** The official filesystem server's tools, said shortly */
const SHORT_DESCRIPTIONS: Record<string, string> = {
  read_text_file:
    "Read a file as text. head or tail: only its first or last N lines.",
  read_multiple_files:
    "Read several files at once; one that fails does not stop the rest.",
  write_file: "Create a file, or replace all of a file's content.",
  edit_file:
    "Replace exact text in a file: each edit's oldText must match the file exactly. Returns a diff. dryRun: show the diff without changing the file.",
  create_directory: "Create a folder, with any missing parent folders.",
  list_directory: "List a folder's entries, marked [FILE] or [DIR].",
  directory_tree:
    "A folder's files and folders as a JSON tree. excludePatterns: glob patterns to skip.",
  move_file:
    "Move or rename a file or folder. Fails if the destination exists.",
  search_files:
    "Find files and folders under path whose path matches a glob pattern ('*.md' here, '**/*.md' in all subfolders).",
  get_file_info:
    "A file's or folder's size, times, permissions and type, without reading it.",
  list_allowed_directories: "The folders the file tools may use.",
};

/** The JSON Schema draft URI, on every one of the server's schemas */
function withoutSchemaUri(
  schema: Record<string, unknown>
): Record<string, unknown> {
  if (!("$schema" in schema)) return schema;
  const { $schema: _uri, ...rest } = schema;
  return rest;
}

function schemaFromParameters(tool: ToolDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters ?? []) {
    properties[p.name] = { type: p.type, description: p.description };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

/** One streamed piece of a call, as in `delta.tool_calls` */
export interface ToolCallDelta {
  index: number;
  function?: { name?: string; arguments?: string };
}

/**
 * Turns streamed calls into SHIELD's text form, piece by piece: the opening
 * once a call has its name, its arguments as they come, the closing when the
 * next call starts or `finish` is called. Each push returns the text to add
 * to the reply.
 */
export class NativeCallWriter {
  private open: number | null = null;
  private named = new Map<number, string>();
  private pending = new Map<number, string>();
  /** The open call's arguments so far, for ranPastCall */
  private openArgs = "";

  constructor(private serverOf: (tool: string) => string) {}

  /**
   * A value the server ran on past its `</parameter>` (no line break before
   * it) has gone on to write the tool's result: everything from there on is
   * made up, so the reply can end. The calls before it are recovered from
   * what was written (toolCallParsing.ts, splitLeakedQwenCalls). IQ1_M
   * wrote an invented file of over 2,000 tokens this way (2026-11-05).
   */
  ranPastCall(): boolean {
    const end = this.openArgs.indexOf("</parameter>");
    return end >= 0 && RESULT_FRAMING.test(this.openArgs.slice(end));
  }

  push(deltas: ToolCallDelta[]): string {
    let out = "";
    for (const delta of deltas) {
      const name = delta.function?.name;
      const args = delta.function?.arguments ?? "";
      if (name && !this.named.has(delta.index)) {
        this.openArgs = this.pending.get(delta.index) ?? "";
      }
      if (args && (name || this.named.has(delta.index))) {
        this.openArgs += args;
      }
      if (name && !this.named.has(delta.index)) {
        if (this.open !== null) out += CLOSE;
        this.named.set(delta.index, name);
        this.open = delta.index;
        out += `<tool_call>\n<server>${this.serverOf(name)}</server>\n<tool>${name}</tool>\n<arguments>`;
        out += this.pending.get(delta.index) ?? "";
        this.pending.delete(delta.index);
      }
      if (!args) continue;
      if (this.named.has(delta.index)) out += args;
      // arguments before the name: held until it comes
      else
        this.pending.set(
          delta.index,
          (this.pending.get(delta.index) ?? "") + args
        );
    }
    return out;
  }

  /** The closing of the last call, or "" when none is open */
  finish(): string {
    if (this.open === null) return "";
    this.open = null;
    return CLOSE;
  }
}

const CLOSE = "</arguments>\n</tool_call>\n";

/** SHIELD's result framing or the template's, as the model imitates it */
export const RESULT_FRAMING =
  /<tool_result|<tool_response>|You executed \d+ tool call|<\|im_(?:start|end)\|>/;
