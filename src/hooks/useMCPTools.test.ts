import { describe, expect, it } from "vitest";
import { describeArrayItems } from "./useMCPTools";

describe("describeArrayItems", () => {
  it("spells out edit_file's edit objects", () => {
    // The filesystem server's edits schema (2026.8.x)
    const edits = {
      type: "array",
      items: {
        type: "object",
        properties: {
          oldText: { type: "string" },
          newText: { type: "string" },
        },
        required: ["oldText", "newText"],
      },
    };
    expect(describeArrayItems(edits)).toBe(
      "Each item: {oldText (string, required), newText (string, required)}"
    );
  });

  it("adds nothing for arrays of plain values or non-arrays", () => {
    expect(
      describeArrayItems({ type: "array", items: { type: "string" } })
    ).toBe("");
    expect(describeArrayItems({ type: "string" })).toBe("");
  });
});
