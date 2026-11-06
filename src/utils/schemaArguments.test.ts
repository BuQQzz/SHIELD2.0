import { describe, expect, it } from "vitest";
import { argumentsForSchema, cleanPaths } from "./schemaArguments";

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

describe("cleanPaths", () => {
  const P = "/home/u/prep/Preparedness_Checklists.md";

  it("cuts the end of a tag off a path", () => {
    for (const tail of ["</", "</}", "</content>", "\n</parameter>", " "]) {
      expect(cleanPaths({ path: P + tail, content: "x" })).toEqual({
        path: P,
        content: "x",
      });
    }
    expect(cleanPaths({ paths: [P + "</", "/a.md"], source: "/b</" })).toEqual({
      paths: [P, "/a.md"],
      source: "/b",
    });
  });

  it("leaves other values and clean paths as they are", () => {
    const args = { path: P, content: "<div>hi</div>" };
    expect(cleanPaths(args)).toBe(args);
  });
});
