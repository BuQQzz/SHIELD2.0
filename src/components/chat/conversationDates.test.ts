import { describe, it, expect } from "vitest";
import { compactAge, dateGroup } from "./conversationDates";

const now = new Date(2026, 8, 24, 15, 0, 0);
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("compactAge", () => {
  it("shortens recent times", () => {
    expect(compactAge(ago(10_000), now)).toBe("now");
    expect(compactAge(ago(12 * MIN), now)).toBe("12m");
    expect(compactAge(ago(5 * HOUR), now)).toBe("5h");
    expect(compactAge(ago(3 * DAY), now)).toBe("3d");
  });

  it("shows a date after a week", () => {
    expect(compactAge(ago(20 * DAY), now)).not.toMatch(/^\d+[mhd]$/);
  });
});

describe("dateGroup", () => {
  it("groups by calendar day", () => {
    expect(dateGroup(ago(14 * HOUR), now)).toBe("Today"); // 01:00 today
    expect(dateGroup(ago(16 * HOUR), now)).toBe("Yesterday"); // 23:00 yesterday
    expect(dateGroup(ago(3 * DAY), now)).toBe("Previous 7 days");
    expect(dateGroup(ago(30 * DAY), now)).toBe("Older");
  });
});
