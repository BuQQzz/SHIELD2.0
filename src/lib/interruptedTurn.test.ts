import { describe, expect, it } from "vitest";
import { APP_RUN, interrupted } from "./interruptedTurn";

describe("interrupted", () => {
  it("is a mark left by an earlier run of SHIELD", () => {
    expect(interrupted("older-run")).toBe(true);
    expect(interrupted(APP_RUN)).toBe(false);
    expect(interrupted(undefined)).toBe(false);
  });
});
