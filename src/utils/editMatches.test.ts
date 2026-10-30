import { describe, expect, it } from "vitest";
import { ambiguousEdit } from "./editMatches";

const file = [
  "## 72-Hour Kit",
  "**Pet Supplies**",
  "- Pet carrier",
  "## 3-Day Kit",
  "**Pet Supplies**",
  "- Pet carrier",
  "## 90-Day Kit",
  "**Pet Supplies**",
  "- Pet carrier",
].join("\n");

describe("ambiguousEdit", () => {
  it("finds an oldText that is in the file more than once, with its lines", () => {
    expect(
      ambiguousEdit(file, [
        { oldText: "**Pet Supplies**\n- Pet carrier", newText: "x" },
      ])
    ).toEqual({ edit: 1, lines: [2, 5, 8] });
  });

  it("passes an oldText made unique by a heading, and a miss", () => {
    expect(
      ambiguousEdit(file, [
        { oldText: "## 90-Day Kit\n**Pet Supplies**", newText: "y" },
        { oldText: "not in the file", newText: "z" },
      ])
    ).toBeNull();
  });

  it("applies earlier edits first, as the tool does", () => {
    // After the first edit, "- Pet carrier" is left in two places
    expect(
      ambiguousEdit(file, [
        {
          oldText: "## 3-Day Kit\n**Pet Supplies**\n- Pet carrier",
          newText: "## 3-Day Kit",
        },
        { oldText: "- Pet carrier", newText: "- Pet crate" },
      ])
    ).toEqual({ edit: 2, lines: [3, 7] });
  });
});
