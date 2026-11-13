import { describe, expect, it } from "vitest";
import { argumentsForSchema } from "./schemaArguments";

const schema = {
  type: "object",
  properties: {
    path: { type: "string" },
    tail: { type: "number" },
    edits: { type: "array" },
    dryRun: { type: "boolean" },
  },
};

describe("argumentsForSchema", () => {
  it("turns recovered text into the types the schema asks for", () => {
    expect(
      argumentsForSchema(
        {
          path: "/p/a.md",
          tail: "34",
          edits: '[{"oldText":"a","newText":"b"}]',
          dryRun: "false",
        },
        schema
      )
    ).toEqual({
      path: "/p/a.md",
      tail: 34,
      edits: [{ oldText: "a", newText: "b" }],
      dryRun: false,
    });
  });

  it("leaves what it cannot convert, and values already right, alone", () => {
    const args = { path: "12", tail: "the end", edits: "not json" };
    expect(argumentsForSchema(args, schema)).toBe(args);
    const typed = { tail: 3 };
    expect(argumentsForSchema(typed, schema)).toBe(typed);
    expect(argumentsForSchema({ tail: "3" }, undefined)).toEqual({ tail: "3" });
  });
});
