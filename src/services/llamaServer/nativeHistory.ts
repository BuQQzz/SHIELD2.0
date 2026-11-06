/**
 * The history as native tool calls (main process only)
 *
 * SHIELD keeps a model's calls in the history as its own text form, and
 * their results as a user message of <tool_result> blocks: everything after
 * (clearing, summaries, the saved chat) works on that. A model with native
 * calls was trained on its template's own form instead, so its requests
 * send the history the OpenAI way: the calls as the assistant message's
 * `tool_calls`, each result as a `tool` message, which the template renders
 * as it was trained (Qwen3.8: <tool_call><function=…> and <tool_response>).
 * Harnesses that sent Qwen3.8's history this way scored higher (research,
 * 2026-11-05). Only the request changes; the history stays as it is.
 */

import type { ChatMessage } from "../chatTypes.js";

export interface NativeToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type WireMessage =
  | ChatMessage
  | { role: "assistant"; content: string; tool_calls: NativeToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const CALL =
  /<tool_call>\s*(?:<server>[^<]*<\/server>\s*)?<tool>([^<]+)<\/tool>\s*<arguments>([\s\S]*?)<\/arguments>\s*<\/tool_call>/g;
const RESULT =
  /<tool_result[^>]*>\s*<tool>([^<]+)<\/tool>\s*([\s\S]*?)<\/tool_result>/g;
/** SHIELD's line before the results (mcpMessageHandler) */
const RESULTS_INTRO =
  /^\s*You executed \d+ tool call\(s\)\. Here are the results:\s*/;

/**
 * The messages with each assistant reply that made calls, and the results
 * that answered it, in the native form. A pair that does not line up (as
 * many results as calls, the same tools in order, arguments that are JSON)
 * is left as text: a request the template cannot render fails outright.
 */
export function nativeHistory(messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    const next = messages[i + 1];
    const pair =
      message.role === "assistant" && next?.role === "user"
        ? asNative(message.content, next.content, i)
        : null;
    if (!pair) {
      out.push(message);
      continue;
    }
    out.push(...pair);
    i++;
  }
  return out;
}

function asNative(
  reply: string,
  results: string,
  at: number
): WireMessage[] | null {
  const calls = [...reply.matchAll(CALL)];
  if (calls.length === 0) return null;
  const answers = [...results.matchAll(RESULT)];
  if (answers.length !== calls.length) return null;

  const toolCalls: NativeToolCall[] = [];
  for (const [k, call] of calls.entries()) {
    const name = call[1]!.trim();
    const args = call[2]!.trim();
    if (answers[k]![1]!.trim() !== name || !isJsonObject(args)) return null;
    toolCalls.push({
      id: `call_${at}_${k}`,
      type: "function",
      function: { name, arguments: args },
    });
  }

  // What follows the results (the next-step lines) ends the last one
  const trailer = results.replace(RESULT, "").replace(RESULTS_INTRO, "").trim();
  const tools: WireMessage[] = answers.map((answer, k) => ({
    role: "tool",
    tool_call_id: toolCalls[k]!.id,
    content:
      answer[2]!.trim() +
      (k === answers.length - 1 && trailer ? `\n\n${trailer}` : ""),
  }));
  return [
    {
      role: "assistant",
      content: reply.replace(CALL, "").trim(),
      tool_calls: toolCalls,
    },
    ...tools,
  ];
}

function isJsonObject(text: string): boolean {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}
