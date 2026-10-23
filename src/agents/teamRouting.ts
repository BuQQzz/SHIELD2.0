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
