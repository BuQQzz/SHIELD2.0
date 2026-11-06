import { describe, expect, it } from "vitest";
import { keptLines } from "./keptLines";

describe("keptLines", () => {
  const file = "# Kit\n\n- Water\n- Food\n- Radio\n- Torch\n";

  it("is 1 for a rewrite that only adds", () => {
    expect(keptLines(file, `${file}\n## Long Island\n- 211\n`)).toBe(1);
  });

  it("counts lines retyped differently or left out as lost", () => {
    expect(keptLines(file, "# Kit\n- Water\n- Foods\n- Radio\n")).toBeCloseTo(
      3 / 5
    );
  });

  it("does not count one kept line for each copy of it", () => {
    expect(keptLines("- a\n- a\n- b\n", "- a\n- b\n")).toBeCloseTo(2 / 3);
  });

  it("ignores blank lines and indentation changes", () => {
    expect(keptLines("a\n\n  b\n", "a\nb")).toBe(1);
    expect(keptLines("\n\n", "anything")).toBe(1);
  });
});
