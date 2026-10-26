import { describe, expect, it } from "vitest";
import { isLooping, RepetitionWatch, REPEAT_WINDOW } from "./repetition";

const cycle =
  "Wait, the file is calc.py, not calcul.py. Let me read calc.py again. Actually, I listed the folder and saw calc.py, so I should read it. ";

describe("isLooping", () => {
  it("spots the same passage written three times", () => {
    expect(isLooping(cycle.repeat(2))).toBe(false);
    expect(isLooping(cycle.repeat(5))).toBe(true);
  });

  it("spots a cycle shorter than the window, and one longer", () => {
    expect(isLooping("Wait, ".repeat(60))).toBe(false); // 360 chars
    expect(isLooping("Wait, ".repeat(120))).toBe(true);
    const long = `${cycle}${cycle.toUpperCase()}${cycle.split("").reverse().join("")}`;
    expect(long.length).toBeGreaterThan(REPEAT_WINDOW);
    expect(isLooping(long.repeat(2))).toBe(false);
    expect(isLooping(long.repeat(3))).toBe(true);
  });

  // The real loop (2026-10-26): the same block, a different doubt each time
  it("spots a block rewritten after a doubt that changes each time", () => {
    const block =
      "\n\n    Okay.\n\n    HANDOFF\n    STATUS: DONE\n    DONE: Implemented `add` function logic ($a + b$).\n    IN PROGRESS: None.\n    NEXT: Write unit tests for the `add` function.\n    NOTES: Logic verified. Ready for testing.\n\n    (I'll output this).\n\n";
    const doubts = ["DONE", "NEXT", "NOTES", "STATUS", "IN PROGRESS"];
    const loop = doubts
      .map(
        (d) =>
          `    Wait, I'll check if "${d}" should be "Code".\n    No.${block}`
      )
      .join("");
    expect(isLooping(loop.slice(0, 400))).toBe(false);
    expect(isLooping(loop)).toBe(true);
  });

  it("leaves varied reasoning and blank space alone", () => {
    const varied = Array.from(
      { length: 80 },
      (_, i) =>
        `Step ${i}: check case ${(i * 7) % 13} of add with ${i} and ${i + 1}. `
    ).join("");
    expect(isLooping(varied)).toBe(false);
    expect(isLooping(`${varied}${" ".repeat(900)}`)).toBe(false);
  });
});

describe("RepetitionWatch", () => {
  it("says so while the loop streams in, not before", () => {
    const watch = new RepetitionWatch();
    let firedAt = -1;
    const text = `Let me think about this carefully. ${cycle.repeat(8)}`;
    for (let i = 0; i < text.length; i += 7) {
      if (watch.push(text.slice(i, i + 7))) {
        firedAt = i;
        break;
      }
    }
    expect(firedAt).toBeGreaterThan(cycle.length * 2);
    expect(firedAt).toBeLessThan(cycle.length * 5);
  });
});
