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

  it("leaves out the filesystem server's duplicates and says its tools shortly", () => {
    const official = (name: string) => ({
      name,
      description: `${name}: a long description. Only works within allowed directories.`,
      serverName: "filesystem",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    });
    const sent = openAiTools([
      official("read_text_file"),
      official("read_file"),
      official("read_media_file"),
      official("list_directory_with_sizes"),
      official("append_file"),
      { ...official("edit_file"), serverName: "elsewhere" },
    ]);

    expect(sent.map((t) => t.function.name)).toEqual([
      "read_text_file",
      "append_file",
      "edit_file",
    ]);
    expect(sent[0]!.function.description).toBe(
      "Read a file as text. head or tail: only its first or last N lines."
    );
    expect(sent[0]!.function.parameters).toEqual({
      type: "object",
      properties: { path: { type: "string" } },
    });
    // SHIELD's own tools and other servers' keep their words
    expect(sent[1]!.function.description).toMatch(/^append_file: a long/);
    expect(sent[2]!.function.description).toMatch(/^edit_file: a long/);
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

  it("sees a value run on into a result the model wrote itself", () => {
    const writer = new NativeCallWriter(() => "filesystem");
    writer.push([
      {
        index: 0,
        function: { name: "read_text_file", arguments: '{"path":"/p/a.md' },
      },
    ]);
    writer.push([
      {
        index: 0,
        function: { arguments: "</parameter>\\n</function>\\n</tool_call>\\n" },
      },
    ]);
    // the next call, swallowed: recovered later, so the reply goes on
    expect(writer.ranPastCall()).toBe(false);
    writer.push([
      {
        index: 0,
        function: {
          arguments: "You executed 1 tool call(s). Here are the results:",
        },
      },
    ]);
    expect(writer.ranPastCall()).toBe(true);
  });

  it("does not take a file that quotes the framing for a run-on value", () => {
    const writer = new NativeCallWriter(() => "filesystem");
    writer.push([
      {
        index: 0,
        function: {
          name: "write_file",
          arguments:
            '{"path":"/p/notes.md","content":"<tool_result> and You executed 2 tool calls"}',
        },
      },
    ]);
    expect(writer.ranPastCall()).toBe(false);
  });
});
