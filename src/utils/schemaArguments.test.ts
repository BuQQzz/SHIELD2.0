import { describe, expect, it } from "vitest";
import {
  argumentsForSchema,
  cleanPaths,
  joinSplitEdits,
  oneReadRange,
} from "./schemaArguments";

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

describe("joinSplitEdits", () => {
  it("joins an edit sent as a newText half and an oldText half", () => {
    expect(
      joinSplitEdits("edit_file", {
        path: "a.md",
        edits: [{ newText: "- b\n- c" }, { oldText: "- b" }],
      })
    ).toEqual({
      path: "a.md",
      edits: [{ oldText: "- b", newText: "- b\n- c" }],
    });
  });

  it("joins each pair of halves in order", () => {
    expect(
      joinSplitEdits("edit_file", {
        path: "a.md",
        edits: [
          { oldText: "a" },
          { newText: "A" },
          { newText: "B" },
          { oldText: "b" },
        ],
      }).edits
    ).toEqual([
      { oldText: "a", newText: "A" },
      { oldText: "b", newText: "B" },
    ]);
  });

  it("leaves whole edits, odd halves, two of a kind and other tools alone", () => {
    const whole = {
      path: "a.md",
      edits: [
        { oldText: "a", newText: "A" },
        { oldText: "b", newText: "B" },
      ],
    };
    const odd = {
      path: "a.md",
      edits: [{ oldText: "a" }, { newText: "A" }, { oldText: "b" }],
    };
    const same = { path: "a.md", edits: [{ oldText: "a" }, { oldText: "b" }] };
    const mixed = {
      path: "a.md",
      edits: [{ oldText: "a" }, { newText: "A", dryRun: true }],
    };
    expect(joinSplitEdits("edit_file", whole)).toBe(whole);
    expect(joinSplitEdits("edit_file", odd)).toBe(odd);
    expect(joinSplitEdits("edit_file", same)).toBe(same);
    expect(joinSplitEdits("edit_file", mixed)).toBe(mixed);
    const other = { edits: [{ newText: "A" }, { oldText: "a" }] };
    expect(joinSplitEdits("write_file", other)).toBe(other);
  });
});

describe("oneReadRange", () => {
  it("reads the whole file for a read asking for both head and tail", () => {
    expect(
      oneReadRange("read_text_file", { path: "a.md", head: 20, tail: 10 })
    ).toEqual({ path: "a.md" });
  });

  it("leaves one range, no range and other tools alone", () => {
    const head = { path: "a.md", head: 20 };
    const tail = { path: "a.md", tail: 10 };
    const other = { path: "a.md", head: 1, tail: 1 };
    expect(oneReadRange("read_text_file", head)).toBe(head);
    expect(oneReadRange("read_text_file", tail)).toBe(tail);
    expect(oneReadRange("read_media_file", other)).toBe(other);
  });
});
