/**
 * A question about the project is for the reviewer, who reads and cannot
 * change anything; the coder is for changes. The system prompt says so, but
 * Bonsai 27B sent a coder to all three read-only questions in a row
 * (2026-10-22), so a question gets a note in the message itself.
 */

/**
 * A message that opens with a question word. Polite requests ("can you add
 * ...") and commands are not questions, and neither are "check" or "find",
 * which ask for something to be done.
 */
const OPENS_A_QUESTION =
  /^\s*(what|where|why|how|which|who|when|is|are|was|were|does|do|did|explain|show|list|tell|describe|summari[sz]e)\b/i;

/** A change asked for after the question: "... and then fix it" */
const ALSO_ASKS_FOR_A_CHANGE =
  /\b(and|then|also|so)\s+(please\s+)?(fix|change|add|create|write|edit|modify|update|implement|rename|remove|delete|refactor|make|replace|rewrite|patch|commit|run)\b/i;

export function isProjectQuestion(message: string): boolean {
  const text = message.trim();
  return OPENS_A_QUESTION.test(text) && !ALSO_ASKS_FOR_A_CHANGE.test(text);
}

export const QUESTION_NOTE =
  "[SHIELD: this message is a question about the project, not a change. Delegate the reviewer to read the files and answer it. Do not use the coder.]";

/**
 * A sentence that opens with a change, after an optional "please" or "can
 * you": "Make add take ...", "The loader is slow. Refactor it ...".
 */
const OPENS_A_CHANGE =
  /(^|[.!?]\s+)(please\s+)?((can|could|would)\s+you\s+(please\s+)?)?(fix|change|add|create|write|edit|modify|update|implement|rename|remove|delete|refactor|make|replace|rewrite|patch)\b/i;

/**
 * A change the user asked for, which the coder can start on at once. Bonsai
 * 27B first sent the reviewer to look at the files in 2-3 of 6 first
 * delegations of a plain change (2026-10-24), a round the coder does not need.
 */
export function isChangeRequest(message: string): boolean {
  const text = message.trim();
  if (isProjectQuestion(text)) return false;
  return OPENS_A_CHANGE.test(text) || ALSO_ASKS_FOR_A_CHANGE.test(text);
}

export const CHANGE_NOTE =
  "[SHIELD: this message asks for a change. Delegate it now to the coder (or to the tester if it is only about tests); the agent reads the files it needs. Do not send the reviewer to look first. A command to run afterwards goes in the same task; add the tester only if the message asks for testing.]";
