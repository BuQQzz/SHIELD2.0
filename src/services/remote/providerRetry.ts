/**
 * Trying a hosted request again when the provider, not the request, failed
 *
 * A rate limit (429), a gateway or server error (5xx) or a dropped
 * connection ended the whole turn at once. Over an hour-long task one of
 * those is likely, and the work stopped on it. opencode tries again with
 * growing waits: 2 s doubling to at most 10 s, ten times, longer when the
 * provider says when to come back (up to 15 minutes), and for up to an
 * hour when the network itself is gone (research, 2026-11-23). The same
 * here, with a 30-minute window for a lost network.
 *
 * Only a request nothing of which was shown yet goes again: the user's
 * messages are sent again as they were, and no reply is half kept.
 */

/** Statuses that say the provider is busy or broken, not the request */
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRY_STATUSES.has(status) || (status >= 520 && status <= 529);
}

/** Tries after the first, for a busy or failing provider */
export const MAX_BUSY_RETRIES = 10;
const BUSY_FIRST_MS = 2000;
const BUSY_GAP_MAX_MS = 10_000;
/** The longest wait a provider's Retry-After may ask for */
export const RETRY_AFTER_MAX_MS = 15 * 60 * 1000;
/** How long a lost network is waited out, from its first failure */
export const UNREACHABLE_WINDOW_MS = 30 * 60 * 1000;
const UNREACHABLE_GAP_MAX_MS = 30_000;

/** Codes of a network that is gone: no name, no route */
const UNREACHABLE_CODES = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENETDOWN",
]);
/** Codes of a connection that broke on the way */
const DROPPED_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/** The provider answered with a status that is worth another try */
export class ProviderBusyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "ProviderBusyError";
  }
}

export type RetryKind = "busy" | "dropped" | "unreachable";

function codeOf(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  // fetch() wraps the socket's error: TypeError("fetch failed", { cause })
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** What kind of failure this is, or null for one not worth retrying */
export function retryKind(error: unknown): RetryKind | null {
  if (error instanceof ProviderBusyError) return "busy";
  const code = codeOf(error);
  if (code && UNREACHABLE_CODES.has(code)) return "unreachable";
  if (code && DROPPED_CODES.has(code)) return "dropped";
  if (error instanceof Error) {
    // undici's words for a stream cut off, with no code to read
    if (error.message === "terminated" || error.message === "fetch failed")
      return "dropped";
  }
  return null;
}

/** Retry-After as milliseconds: seconds or an HTTP date */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now()
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now;
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.min(ms, RETRY_AFTER_MAX_MS);
}

export interface RetryState {
  /** Retries made so far for this message */
  attempt: number;
  /** When the first failure was, for the lost-network window */
  since: number;
}

/**
 * How long to wait before the next try, or null to give up. `random` is
 * for tests; the jitter keeps several agents from retrying in step.
 */
export function nextRetryDelay(
  kind: RetryKind,
  state: RetryState,
  retryAfterMs?: number,
  now = Date.now(),
  random = Math.random
): number | null {
  const jitter = 0.8 + random() * 0.4;
  if (kind === "unreachable") {
    if (now - state.since > UNREACHABLE_WINDOW_MS) return null;
    return Math.round(
      Math.min(
        BUSY_FIRST_MS * 2 ** state.attempt * jitter,
        UNREACHABLE_GAP_MAX_MS
      )
    );
  }
  if (state.attempt >= MAX_BUSY_RETRIES) return null;
  const backoff = Math.min(BUSY_FIRST_MS * 2 ** state.attempt, BUSY_GAP_MAX_MS);
  return Math.round(Math.max(backoff * jitter, retryAfterMs ?? 0));
}

/** For the status line: why it waits */
export function retryReason(kind: RetryKind, error: unknown): string {
  if (error instanceof ProviderBusyError) {
    return error.status === 429
      ? "Rate limited"
      : `Provider error (HTTP ${error.status})`;
  }
  return kind === "unreachable" ? "No network" : "Connection dropped";
}

/** Waits, or ends early when the signal aborts (the user pressed Stop) */
export function waitOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}
