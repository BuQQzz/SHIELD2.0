// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isRetryableStatus,
  MAX_BUSY_RETRIES,
  nextRetryDelay,
  parseRetryAfter,
  ProviderBusyError,
  RETRY_AFTER_MAX_MS,
  retryKind,
  UNREACHABLE_WINDOW_MS,
  waitOrAbort,
} from "./providerRetry";

const mid = () => 0.5; // no jitter

describe("which failures are tried again", () => {
  it("takes a busy or broken provider, not a wrong request", () => {
    for (const status of [408, 429, 500, 502, 503, 504, 529])
      expect(isRetryableStatus(status)).toBe(true);
    for (const status of [400, 401, 403, 404, 413, 422])
      expect(isRetryableStatus(status)).toBe(false);
  });

  it("reads the network error inside fetch's own", () => {
    const wrapped = (code: string) =>
      Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("x"), { code }),
      });
    expect(retryKind(wrapped("ENOTFOUND"))).toBe("unreachable");
    expect(retryKind(wrapped("ECONNRESET"))).toBe("dropped");
    expect(retryKind(new TypeError("terminated"))).toBe("dropped");
    expect(retryKind(new ProviderBusyError("busy", 429))).toBe("busy");
    expect(retryKind(new Error("Experiential rejected the key."))).toBeNull();
    expect(retryKind(new DOMException("aborted", "AbortError"))).toBeNull();
  });
});

describe("parseRetryAfter", () => {
  it("takes seconds or a date, and caps a very long one", () => {
    expect(parseRetryAfter("7")).toBe(7000);
    expect(parseRetryAfter(new Date(70_000).toUTCString(), 10_000)).toBe(
      60_000
    );
    expect(parseRetryAfter("99999")).toBe(RETRY_AFTER_MAX_MS);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
  });
});

describe("nextRetryDelay", () => {
  it("doubles from 2 s to at most 10 s, then gives up", () => {
    const delays = Array.from({ length: MAX_BUSY_RETRIES }, (_, attempt) =>
      nextRetryDelay("busy", { attempt, since: 0 }, undefined, 0, mid)
    );
    expect(delays.slice(0, 4)).toEqual([2000, 4000, 8000, 10_000]);
    expect(
      nextRetryDelay(
        "dropped",
        { attempt: MAX_BUSY_RETRIES, since: 0 },
        undefined,
        0,
        mid
      )
    ).toBeNull();
  });

  it("waits as long as the provider asks", () => {
    expect(
      nextRetryDelay("busy", { attempt: 0, since: 0 }, 45_000, 0, mid)
    ).toBe(45_000);
  });

  it("waits out a lost network for its window, 30 s apart at most", () => {
    expect(
      nextRetryDelay(
        "unreachable",
        { attempt: 20, since: 0 },
        undefined,
        1000,
        mid
      )
    ).toBe(30_000);
    expect(
      nextRetryDelay(
        "unreachable",
        { attempt: 20, since: 0 },
        undefined,
        UNREACHABLE_WINDOW_MS + 1,
        mid
      )
    ).toBeNull();
  });
});

describe("waitOrAbort", () => {
  it("ends at once on Stop", async () => {
    const stop = new AbortController();
    const started = Date.now();
    const waiting = waitOrAbort(60_000, stop.signal);
    stop.abort();
    await waiting;
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
