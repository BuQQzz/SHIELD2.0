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

export interface WaitingDeps {
  /** False after Stop, or once another chat is open */
  canGoOn: () => boolean;
  takeSteer: () => string[];
  nextQueued: () => string | undefined;
  takeQueue: () => string[];
  send: (content: string, options?: { shown?: boolean }) => Promise<void>;
  /** Into the input box */
  restore: (text: string) => void;
}

/**
 * After a turn: steer no tool result came to take goes as the next message
 * (it is in the chat already), then each queued message as a turn of its
 * own, in order. After Stop, or in another chat, what waits goes back in the
 * box for the user to decide.
 */
export async function sendWhatWaits(deps: WaitingDeps): Promise<void> {
  for (;;) {
    if (!deps.canGoOn()) {
      const waiting = [...deps.takeSteer(), ...deps.takeQueue()];
      if (waiting.length) deps.restore(waiting.join("\n\n"));
      return;
    }
    const left = deps.takeSteer();
    if (left.length) {
      await deps.send(left.join("\n\n"), { shown: true });
      continue;
    }
    const next = deps.nextQueued();
    if (next === undefined) return;
    await deps.send(next);
  }
}
