import { describe, expect, it } from "vitest";
import { ambiguousEdit, relaxedEdits } from "./editMatches";

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

describe("relaxedEdits", () => {
  const file =
    'def next_id(records):\n    return max((r["id"] for r in records), default=0) + 1\n\n\ndef money(amount):\n    return f"${amount:.2f}"\n\n\ndef main():\n    pass\n';

  it("takes the file's blank lines when oldText has fewer (g11 step 5)", () => {
    const edits = [
      {
        oldText:
          'def next_id(records):\n    return max((r["id"] for r in records), default=0) + 1\n\ndef money(amount):\n    return f"${amount:.2f}"',
        newText: "X",
      },
    ];
    const out = relaxedEdits(file, edits) as Array<{ oldText: string }>;
    expect(out[0]!.oldText).toBe(
      'def next_id(records):\n    return max((r["id"] for r in records), default=0) + 1\n\n\ndef money(amount):\n    return f"${amount:.2f}"'
    );
  });

  it("ignores trailing spaces, and works on later edits after earlier ones", () => {
    const out = relaxedEdits(file, [
      { oldText: "def main():\n    pass", newText: "def main():\n    run()" },
      { oldText: "def main():  \n    run()", newText: "Y" },
    ]) as Array<{ oldText: string }>;
    expect(out[1]!.oldText).toBe("def main():\n    run()");
  });

  it("leaves edits alone when they match, miss outright, or match twice", () => {
    expect(relaxedEdits(file, [{ oldText: "def main():", newText: "x" }])).toBeNull();
    expect(relaxedEdits(file, [{ oldText: "def other():\n\n    pass", newText: "x" }])).toBeNull();
    const twice = "a\n\n\nb\na\n\nb\n";
    expect(relaxedEdits(twice, [{ oldText: "a\n\n\n\nb", newText: "x" }])).toBeNull();
  });

  it("never adds blank lines where oldText has none", () => {
    expect(relaxedEdits(file, [{ oldText: '    return f"${amount:.2f}"\ndef main():', newText: "x" }])).toBeNull();
  });
});
