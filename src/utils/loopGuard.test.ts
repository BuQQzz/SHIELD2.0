import { describe, expect, it } from "vitest";
import { isLooping, LoopGuard } from "./loopGuard";

const repeat = (text: string, times: number) =>
  Array.from({ length: times }, () => text).join("");

describe("isLooping", () => {
  it("catches one line written over and over (Gemma, 2026-09-26)", () => {
    const line = " طالبة أ ل أ برة من أ ج ر ب \n";
    expect(isLooping(repeat(line, 30))).toBe(true);
  });

  it("catches reasoning that goes round in circles", () => {
    const round = [
      "Wait, I should check if `f3.ps1` is part of this.",
      "It seems like a snippet file.",
      "I will include it in the table.",
      "Let me double check the list of files again.",
      "",
    ].join("\n");
    const start =
      "I read the scripts. Now I need to build the table for SCRIPTS.md.\n";
    expect(isLooping(start + repeat(round, 5))).toBe(true);
  });

  it("catches a loop with no line breaks", () => {
    expect(
      isLooping(`Answer: ${repeat("I will write the file now. ", 8)}`)
    ).toBe(true);
  });

  it("lets a long table of different rows through", () => {
    const rows = Array.from(
      { length: 40 },
      (_, i) => `| script${i}.ps1 | Does thing number ${i}. | Keep |`
    ).join("\n");
    expect(
      isLooping(`| Name | Purpose | Action |\n|---|---|---|\n${rows}`)
    ).toBe(false);
  });

  it("lets a page with some identical lines through", () => {
    const cells = repeat('    <div class="cell"></div>\n', 8);
    const other = Array.from(
      { length: 30 },
      (_, i) => `    <p class="note">Paragraph ${i} of the page body.</p>`
    ).join("\n");
    expect(isLooping(`<main>\n${cells}${other}\n</main>`)).toBe(false);
  });

  it("does not count rules, dashes or short lines", () => {
    expect(isLooping(repeat("-", 3000))).toBe(false);
    expect(isLooping(repeat("}\n", 200))).toBe(false);
    expect(isLooping(repeat("0, ", 400))).toBe(false);
  });
});

describe("LoopGuard", () => {
  it("trips once, while streaming", () => {
    const guard = new LoopGuard();
    const line = "The same sentence goes out again and again.\n";
    let trippedAt = -1;
    for (let i = 0; i < 100; i++) {
      if (guard.push(line)) {
        expect(trippedAt).toBe(-1);
        trippedAt = i;
      }
    }
    expect(trippedAt).toBeGreaterThan(0);
    expect(trippedAt).toBeLessThan(30);
    expect(guard.hasTripped).toBe(true);
  });
});
