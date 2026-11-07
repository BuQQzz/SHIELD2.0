/**
 * MCP Retry Policy
 *
 * Detects refusal-style responses for tool-eligible requests and builds a
 * strict one-shot retry prompt to force tool-call output.
 */

import { osName } from "../utils/platform";

const REFUSAL_PATTERNS: RegExp[] = [
  /don't have direct access/i,
  /do not have direct access/i,
  /cannot directly access your computer/i,
  /cannot directly access your computer or desktop/i,
  /can't access external systems/i,
  /cannot access external systems/i,
  /can't modify files on your device/i,
  /cannot modify files on your device/i,
  /i can't run code on your computer/i,
  /i cannot run code on your computer/i,
  /due to security and privacy restrictions/i,
  /i can guide you through/i,
  /i can help you create it yourself/i,
];

const TOOL_INTENT_PATTERNS: RegExp[] = [
  /\b(create|make|write|save|generate)\b[\s\S]*\b(file|html|desktop|documents?)\b/i,
  /\b(todo\s*list)\b[\s\S]*\b(html|file|desktop)\b/i,
  /\bwrite_file\b/i,
];

export function isLikelyMCPToolIntent(userContent: string): boolean {
  return TOOL_INTENT_PATTERNS.some((pattern) => pattern.test(userContent));
}

export function shouldRetryWithMCP(
  userContent: string,
  assistantContent: string
): boolean {
  const hasRefusal = REFUSAL_PATTERNS.some((pattern) =>
    pattern.test(assistantContent)
  );
  if (!hasRefusal) {
    return false;
  }

  return isLikelyMCPToolIntent(userContent);
}

export function buildMCPRetryPrompt(
  userContent: string,
  allowedTools?: string[]
): string {
  const allowedToolsHint =
    allowedTools && allowedTools.length > 0
      ? `Allowed tools: ${allowedTools.join(", ")}.`
      : "Allowed tools are available from MCP.";

  return [
    "You have MCP filesystem tools available in this environment.",
    allowedToolsHint,
    "Do NOT refuse. Do NOT explain limitations.",
    "If the request is file-related, use the tool-call format provided in your instructions.",
    "Prefer write_file for file creation requests.",
    `Use a full ${osName()} path inside the folder listed in your instructions.`,
    "No prose before or after the tool call.",
    "",
    `User request: ${userContent}`,
  ].join("\n");
}

/** Longest reply taken for an announcement alone, not an answer */
const ANNOUNCEMENT_CHARS = 600;

/**
 * A short reply that says what it will do and stops, with no call. Qwen3.8
 * (IQ1_M, thinking off) answered an edit request with "I'll add the
 * \"Long Island, NY\" section to the end of that checklist file…" and
 * nothing else, and nothing was changed (2026-11-05).
 */
export function announcesWithoutActing(assistantContent: string): boolean {
  const reply = assistantContent.trim();
  if (reply === "" || reply.length > ANNOUNCEMENT_CHARS) return false;
  // A path alone: the rest of a call whose markup was lost (the whole
  // reply to an edit request, 2026-11-05)
  if (/^(?:[a-z]:)?[\\/][^\s]*$/i.test(reply)) return true;
  if (reply.endsWith("?")) return false;
  return /^(?:(?:ok(?:ay)?|sure|now|first|next),?\s+)?(?:i'll|i will|let me|i'm going to|i am going to)\b/i.test(
    reply
  );
}

/** "I'll / let me / I need to" and then a step a tool takes */
const ANNOUNCED_STEP =
  /\b(?:i'll|i will|let me|i'm going to|i am going to|i need to)\s+(?:(?:now|first|then|also|just)\s+)*(?:read|write|append|add|edit|create|update|check|open|list|look|search|fix|replace|insert|make|use|call|save|apply|run|fetch|get|try)\b/i;

/**
 * A reply after tool results whose last sentence says what it will do
 * next, with no call: the turn ended there and nothing was done. Qwen3.8
 * IQ1_M ended a turn on "I'll append the new section at the end of the
 * file, matching its existing heading style." (native history), and on
 * 1,400 characters of plan ending "Let me now create the content"
 * (2026-11-05/06). A closing answer ("I'll let the user know…", "Let me
 * know if…") names no step and is left alone.
 */
export function endsByAnnouncing(assistantContent: string): boolean {
  const sentences = assistantContent
    .trim()
    .split(/(?<=[.!?:])\s+|\n+/)
    .filter((s) => s.trim() !== "");
  const last = sentences[sentences.length - 1]?.trim() ?? "";
  if (last === "" || last.endsWith("?")) return false;
  return ANNOUNCED_STEP.test(last);
}

export function buildActNowPrompt(): string {
  return "You said what you would do but made no tool call, so nothing has happened yet. Make the tool call now, with no other text.";
}
