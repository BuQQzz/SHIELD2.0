import { describe, expect, it } from "vitest";
import {
  HOSTED_QUIET_MS,
  FROZEN_AFTER_MS,
  SLOW_AFTER_MS,
  minutesAndSeconds,
  stuckState,
  type RequestStatus,
} from "./rescue";

const status = (over: Partial<RequestStatus>): RequestStatus => ({
  agent: true,
  phase: "writing",
  elapsedMs: 0,
  idleMs: 0,
  ...over,
});

describe("stuckState", () => {
  it("shows nothing for a short step or none at all", () => {
    expect(stuckState(null)).toBe("hidden");
    expect(stuckState(status({ elapsedMs: 10_000 }))).toBe("hidden");
  });

  it("shows the timer once a step has run a while", () => {
    expect(stuckState(status({ elapsedMs: 45_000, idleMs: 1000 }))).toBe(
      "timer"
    );
  });

  it("calls a step with no new output for a minute frozen", () => {
    expect(
      stuckState(status({ elapsedMs: 70_000, idleMs: FROZEN_AFTER_MS }))
    ).toBe("frozen");
  });

  it("calls a long step that still writes slow", () => {
    expect(stuckState(status({ elapsedMs: SLOW_AFTER_MS, idleMs: 500 }))).toBe(
      "slow"
    );
  });

  it("never calls summarising frozen: it has no live progress", () => {
    expect(
      stuckState(
        status({ phase: "summarising", elapsedMs: 90_000, idleMs: 90_000 })
      )
    ).toBe("timer");
  });
});

describe("minutesAndSeconds", () => {
  it("writes m:ss", () => {
    expect(minutesAndSeconds(5_000)).toBe("0:05");
    expect(minutesAndSeconds(192_400)).toBe("3:12");
  });
});

describe("a hosted request", () => {
  const hosted = (elapsedMs: number, idleMs: number) => ({
    agent: false,
    phase: "reading" as const,
    elapsedMs,
    idleMs,
    hosted: true,
  });

  it("shows no timer and no frozen-server warning while it thinks", () => {
    expect(stuckState(hosted(52_000, 52_000))).toBe("hidden");
    expect(stuckState(hosted(4 * 60_000, 158_000))).toBe("hidden");
  });

  it("offers to ask again only after five quiet minutes", () => {
    expect(stuckState(hosted(6 * 60_000, HOSTED_QUIET_MS))).toBe("quiet");
  });
});
