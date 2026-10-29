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

/** The tools as llama-server takes them: plain names, the first of a name wins */
export function openAiTools(tools: ToolDefinition[]): OpenAiTool[] {
  const seen = new Set<string>();
  const out: OpenAiTool[] = [];
  for (const tool of tools) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    out.push({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema ?? schemaFromParameters(tool),
      },
    });
  }
  return out;
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

  constructor(private serverOf: (tool: string) => string) {}

  push(deltas: ToolCallDelta[]): string {
    let out = "";
    for (const delta of deltas) {
      const name = delta.function?.name;
      const args = delta.function?.arguments ?? "";
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
