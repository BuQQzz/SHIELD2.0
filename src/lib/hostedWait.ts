/**
 * The words and the clock for a hosted model's wait (components/chat/
 * HostedWaitLabel).
 */

import { useEffect, useState } from "react";

/** Seconds since `since`, counted up once a second */
export function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return Math.max(0, Math.floor((now - since) / 1000));
}

/** Seconds a request is "being sent" before it counts as thinking */
const SENDING_SECONDS = 4;
/** After this, say the wait is the model thinking */
const LONG_WAIT_SECONDS = 30;

export function waitText(
  provider: string,
  afterTools: boolean,
  seconds: number,
  retry?: { attempt: number; reason: string }
): string {
  // The provider failed and SHIELD waits to send it again
  // (remote/providerRetry.ts): said, so a long gap is not taken for a hang
  if (retry) {
    return `${retry.reason} at ${provider} · trying again (${retry.attempt}) · ${seconds}s`;
  }
  if (seconds < SENDING_SECONDS) return `Sending to ${provider}…`;
  const doing = afterTools ? "Working on the results" : "Thinking";
  const long =
    seconds >= LONG_WAIT_SECONDS
      ? " · this model thinks before it shows anything"
      : "";
  return `${doing} · ${seconds}s${long}`;
}
