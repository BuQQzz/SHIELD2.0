import { describe, expect, it } from "vitest";
import { describeArrayItems, toToolDefinition } from "./useMCPTools";

describe("toToolDefinition", () => {
  it("preserves complete schemas for native calls alongside legacy parameter descriptions", () => {
    const inputSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1 },
        edits: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              oldText: { type: "string" },
              newText: { type: "string" },
            },
            required: ["oldText", "newText"],
            additionalProperties: false,
          },
        },
      },
      required: ["path", "edits"],
    };
    const tool = toToolDefinition("filesystem", {
      name: "edit_file",
      inputSchema,
      annotations: { readOnlyHint: false },
    });

    expect(tool?.inputSchema).toEqual(inputSchema);
    expect(tool?.parameters).toContainEqual({
      name: "edits",
      type: "array",
      description:
        "Each item: {oldText (string, required), newText (string, required)}",
      required: true,
    });
    expect(tool?.annotations).toEqual({ readOnlyHint: false });
  });

  it("keeps tools without schemas compatible and rejects unnamed tools", () => {
    expect(toToolDefinition("test", { name: "ping" })).toEqual({
      name: "ping",
      description: "",
      serverName: "test",
      parameters: [],
    });
    expect(
      toToolDefinition("test", { description: "missing name" })
    ).toBeNull();
  });
});

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
