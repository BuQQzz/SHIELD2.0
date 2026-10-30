// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractToolCalls } from "../../handlers/toolCallParsing";
import { NativeCallWriter, openAiTools } from "./nativeCalls";

describe("openAiTools", () => {
  it("sends plain names with the tool's own schema, each name once", () => {
    const schema = {
      type: "object",
      properties: { query: { type: "string" } },
    };
    expect(
      openAiTools([
        {
          name: "web_search",
          description: "Search",
          serverName: "web",
          inputSchema: schema,
        },
        { name: "web_search", description: "again", serverName: "other" },
      ])
    ).toEqual([
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search",
          parameters: schema,
        },
      },
    ]);
  });

  it("builds a schema from the parameter list when there is none", () => {
    const [tool] = openAiTools([
      {
        name: "read_text_file",
        description: "Read",
        parameters: [
          { name: "path", type: "string", description: "File", required: true },
        ],
      },
    ]);
    expect(tool!.function.parameters).toEqual({
      type: "object",
      properties: { path: { type: "string", description: "File" } },
      required: ["path"],
    });
  });
});

describe("NativeCallWriter", () => {
  const servers: Record<string, string> = {
    web_search: "web",
    write_file: "filesystem",
  };

  it("writes streamed calls as SHIELD's text form, which reads back as the same calls", () => {
    const writer = new NativeCallWriter(
      (tool) => servers[tool] ?? "filesystem"
    );
    let text = "Let me look.\n";
    text += writer.push([
      { index: 0, function: { name: "web_search", arguments: '{"que' } },
    ]);
    text += writer.push([
      { index: 0, function: { arguments: 'ry":"radio"}' } },
    ]);
    // arguments of the next call before its name
    text += writer.push([
      { index: 1, function: { arguments: '{"path":"/p/a.md",' } },
    ]);
    text += writer.push([
      { index: 1, function: { name: "write_file" } },
      { index: 1, function: { arguments: '"content":"# A\\n\\"q\\" \\\\"}' } },
    ]);
    text += writer.finish();
    expect(writer.finish()).toBe("");

    expect(extractToolCalls(text)).toMatchObject([
      { serverName: "web", tool: "web_search", arguments: { query: "radio" } },
      {
        serverName: "filesystem",
        tool: "write_file",
        arguments: { path: "/p/a.md", content: '# A\n"q" \\' },
      },
    ]);
    expect(text.startsWith("Let me look.\n<tool_call>")).toBe(true);
  });
});
