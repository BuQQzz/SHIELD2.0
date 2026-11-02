/**
 * A handoff briefing between models
 *
 * Switching models inside one chat makes the new model condition on turns it
 * did not write. That measurably drifts its output (performance-drift work
 * puts a single-turn handoff at -8 to +13 points in strict success, and the
 * effect is largest across model families), and on a local llama-server the
 * changed system prompt also costs a full, uncached re-read of the history.
 * A fresh session opened with a short briefing is the reliable fix, better
 * than a "reset" instruction left in the same thread (see docs/HANDOFF.md,
 * 2026-10-30).
 *
 * The model in use writes the briefing. A mechanical one, built from the
 * chat's own user turns, files and failures, stands in when the model cannot
 * answer. Tool results are described by what they acted on, not repeated: a
 * handoff is the decisions, not the transcript.
 */

import type { Message } from "../hooks/useLlama";
import { stripToolCallMarkup } from "./mcpToolHandler";

/** The instruction the parting model answers with the briefing */
export const HANDOFF_SYSTEM_PROMPT = `You write a short handoff note so another AI model can continue this work in a fresh session. Read the conversation and reply with plain text only, using exactly these headings and nothing else:
GOAL: one sentence, what the user is trying to achieve.
DONE: the concrete things already done (files written or edited, commands run, results), with their exact paths or names.
DECIDED: choices already settled, and anything ruled out.
OPEN: what is still to do, with the exact files, functions or commands it involves.
CAUTION: mistakes to avoid, or a step that must not be repeated as-is.
Keep it under 250 words. No preamble, no code fences, no markdown tables.`;

const MAX_TRANSCRIPT_CHARS = 12_000;
const MAX_HANDOFF_CHARS = 4_000;
/** A shorter answer than this is not a handoff (a stray token, an apology) */
const MIN_MODEL_HANDOFF_CHARS = 40;

/** One line for the parting model: the user's turns, the model's words, its tools */
function describe(message: Message): string | null {
  const tool = message.toolResult;
  if (tool) {
    const where = tool.target ? ` ${tool.target}` : "";
    return `[ran ${tool.tool}${where}: ${tool.success ? "ok" : "failed"}]`;
  }
  const text = message.content.trim();
  if (!text) return null;
  if (message.role === "user") return `USER: ${text}`;
  const answer = stripToolCallMarkup(text).trim();
  return answer ? `ASSISTANT: ${answer}` : null;
}

/**
 * The conversation as text for the parting model, newest turns kept when it
 * is long (the end of a chat is what a handoff needs).
 */
export function transcriptForHandoff(
  messages: Message[],
  maxChars = MAX_TRANSCRIPT_CHARS
): string {
  const kept: string[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const line = describe(messages[i]!);
    if (!line) continue;
    if (total + line.length + 1 > maxChars) break;
    kept.unshift(line);
    total += line.length + 1;
  }
  return kept.join("\n");
}

/** Collapse a message to one short line */
function oneLine(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * A briefing built from the chat itself, for when the model cannot write
 * one: the goal, the files it touched, the steps that failed, what is open.
 */
export function mechanicalHandoff(messages: Message[]): string {
  const userTurns = messages.filter(
    (m) => m.role === "user" && !m.toolResult && m.content.trim()
  );
  const first = userTurns[0];
  const last = userTurns[userTurns.length - 1];
  const targets = [
    ...new Set(
      messages.map((m) => m.toolResult?.target).filter((t): t is string => !!t)
    ),
  ];
  const failed = [
    ...new Set(
      messages
        .filter((m) => m.toolResult && !m.toolResult.success)
        .map(
          (m) =>
            `${m.toolResult!.tool}${m.toolResult!.target ? ` ${m.toolResult!.target}` : ""}`
        )
    ),
  ];

  const lines = [
    `GOAL: ${first ? oneLine(first.content) : "Continue the work from the previous session."}`,
  ];
  if (targets.length) lines.push(`DONE: touched ${targets.join(", ")}`);
  if (failed.length)
    lines.push(
      `CAUTION: these steps failed in the last session and should not be repeated as-is: ${failed.join("; ")}`
    );
  if (last && last !== first) lines.push(`OPEN: ${oneLine(last.content)}`);
  return lines.join("\n");
}

/** Ask the parting model for the briefing; returns "" when it cannot */
export type HandoffAsker = (transcript: string) => Promise<string>;

/**
 * The briefing, written by the model when it can, else the mechanical one.
 * `by` says which, so the note can be honest about its source.
 */
export async function writeHandoff(
  messages: Message[],
  ask: HandoffAsker
): Promise<{ text: string; by: "model" | "mechanical" }> {
  const fallback = mechanicalHandoff(messages);
  const transcript = transcriptForHandoff(messages);
  if (!transcript.trim()) return { text: fallback, by: "mechanical" };
  try {
    const text = (await ask(transcript)).trim().slice(0, MAX_HANDOFF_CHARS);
    if (text.length < MIN_MODEL_HANDOFF_CHARS) {
      return { text: fallback, by: "mechanical" };
    }
    return { text, by: "model" };
  } catch {
    return { text: fallback, by: "mechanical" };
  }
}

/** The first message of the new session: the briefing, with where it came from */
export function handoffMessage({
  text,
  by,
  fromModel,
  toModel,
}: {
  text: string;
  by: "model" | "mechanical";
  fromModel?: string;
  toModel?: string;
}): string {
  return [
    `Handoff from a previous session${fromModel ? ` on ${fromModel}` : ""}${
      toModel ? `, for this one on ${toModel}` : ""
    }.`,
    by === "mechanical"
      ? "(Assembled by SHIELD from the chat, not written by a model.)"
      : "",
    "",
    text,
    "",
    "Continue from here. Ask before changing files if anything is unclear.",
  ]
    .filter((line) => line !== "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
