// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildNativeTools } from "./nativeTools";
import type { ToolDefinition } from "../types/prompts";

const tool = (inputSchema: Record<string, unknown>): ToolDefinition => ({
  name: "read_file",
  description: "Read a file",
  serverName: "filesystem",
  inputSchema,
});

describe("native tool declarations", () => {
  it("preserves nested edits, required fields, nullable data and optional parameters", () => {
    const inputSchema = {
      type: "object",
      required: ["path", "edits"],
      properties: {
        path: { type: "string" },
        edits: {
          type: "array",
          items: {
            type: "object",
            required: ["oldText", "newText"],
            properties: {
              oldText: { type: "string" },
              newText: { type: "string" },
            },
          },
        },
        dryRun: { type: "boolean" },
        metadata: { anyOf: [{ type: "null" }, { type: "object" }] },
      },
    };
    const { functions } = buildNativeTools([tool(inputSchema)]);
    expect(functions.filesystem__read_file?.params).toEqual(inputSchema);
    expect(functions.filesystem__read_file).not.toHaveProperty("handler");
  });

  it("retains requiredness when adapting legacy flattened definitions", () => {
    const { functions } = buildNativeTools([
      {
        name: "read_file",
        description: "Read",
        parameters: [
          { name: "path", type: "string", description: "Path", required: true },
          {
            name: "head",
            type: "number",
            description: "Lines",
            required: false,
          },
        ],
      },
    ]);
    expect(functions.filesystem__read_file?.params).toMatchObject({
      required: ["path"],
      properties: { path: { type: "string" }, head: { type: "number" } },
    });
  });
});

describe("native function identities", () => {
  it("maps all sanitized and delimiter collisions deterministically to their original tools", () => {
    const definitions = [
      { ...tool({}), serverName: "server-a", name: "run" },
      { ...tool({}), serverName: "server_a", name: "run" },
      { ...tool({}), serverName: "a__b", name: "c" },
      { ...tool({}), serverName: "a", name: "b__c" },
      { ...tool({}), serverName: "1server", name: "tool name" },
      { ...tool({}), serverName: "filesystem", name: "read_file" },
    ];
    const first = buildNativeTools(definitions);
    const reversed = buildNativeTools([...definitions].reverse());
    expect([...first.toolsByName]).toEqual([...reversed.toolsByName]);
    expect(first.toolsByName.size).toBe(definitions.length);
    expect(first.toolsByName.get("filesystem__read_file")).toBe(definitions[5]);
    expect(Object.keys(first.functions)).toEqual([...first.toolsByName.keys()]);
    for (const name of first.toolsByName.keys())
      expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    for (const definition of definitions)
      expect([...first.toolsByName.values()]).toContain(definition);
  });

  it("rejects duplicate server/tool identities instead of overwriting a function", () => {
    expect(() => buildNativeTools([tool({}), tool({})])).toThrow(
      "Duplicate native tool identity"
    );
  });
});
