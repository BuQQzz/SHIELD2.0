import { describe, expect, it } from "vitest";
import { changePreview } from "./changePreview";

describe("changePreview", () => {
  it("shows the lines an edit takes out and puts in", () => {
    expect(
      changePreview("edit_file", {
        path: "/p/calc.py",
        edits: [
          {
            oldText: "def add(a, b):\n    return a - b",
            newText: "def add(a, b, c=0):\n    return a + b + c",
          },
        ],
      })
    ).toEqual({
      kind: "edit",
      edits: [
        {
          removed: ["def add(a, b):", "    return a - b"],
          added: ["def add(a, b, c=0):", "    return a + b + c"],
          hiddenRemoved: 0,
          hiddenAdded: 0,
        },
      ],
      moreEdits: 0,
    });
  });

  it("shows a deletion as lines taken out and none put in", () => {
    const preview = changePreview("edit_file", {
      edits: [{ oldText: "x = 1\n", newText: "" }],
    });
    expect(preview).toMatchObject({
      edits: [{ removed: ["x = 1"], added: [] }],
    });
  });

  it("keeps a long edit short and says what it left out", () => {
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const preview = changePreview("edit_file", {
      edits: Array.from({ length: 5 }, () => ({ oldText: long, newText: "y" })),
    });
    expect(preview?.kind).toBe("edit");
    if (preview?.kind !== "edit") return;
    expect(preview.edits).toHaveLength(3);
    expect(preview.moreEdits).toBe(2);
    expect(preview.edits[0]).toMatchObject({
      hiddenRemoved: 12,
      hiddenAdded: 0,
    });
    expect(preview.edits[0]?.removed).toHaveLength(8);
  });

  it("shows the start of a file a write creates", () => {
    const content = Array.from({ length: 12 }, (_, i) => `row ${i}`).join("\n");
    expect(changePreview("write_file", { path: "a.txt", content })).toEqual({
      kind: "write",
      lines: Array.from({ length: 8 }, (_, i) => `row ${i}`),
      hiddenLines: 4,
      chars: content.length,
    });
  });

  it("has nothing to show for other tools or an empty call", () => {
    expect(changePreview("read_text_file", { path: "a" })).toBeNull();
    expect(changePreview("edit_file", { edits: [] })).toBeNull();
    expect(changePreview("edit_file", {})).toBeNull();
    expect(changePreview("write_file", {})).toBeNull();
  });
});
