/**
 * Steer: what the user sends while a turn is running. It is not a new turn:
 * it goes with the next tool result to whoever is working (the running
 * agent, else the orchestrator or the chat), so the work can change course
 * without being stopped. Held in generationStore until then; whatever is
 * left when the turn ends is sent as the next message.
 */

/** A tool result with the user's messages added after it */
export function withSteer(text: string, notes: string[]): string {
  if (notes.length === 0) return text;
  const said = notes.map((note) => `"${note}"`).join(", then ");
  return `${text}\n\n[The user sent this while you were working: ${said}. Take it into account from here on: it may change what you do next.]`;
}
