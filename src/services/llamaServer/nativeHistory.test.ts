// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nativeHistory } from "./nativeHistory";

const call = (tool: string, args: string) =>
  `<tool_call>\n<server>filesystem</server>\n<tool>${tool}</tool>\n<arguments>${args}</arguments>\n</tool_call>`;
const result = (tool: string, body: string) =>
  `<tool_result trusted="false">\n<tool>${tool}</tool>\n<result>\n${body}\n</result>\n</tool_result>`;
const results = (...blocks: string[]) =>
  `You executed ${blocks.length} tool call(s). Here are the results:\n\n${blocks.join("\n\n")}\n\nIf you need another tool to finish the request, call it now.`;

describe("nativeHistory", () => {
  it("sends calls as tool_calls and each result as a tool message", () => {
    const wire = nativeHistory([
      { role: "user", content: "add a section" },
      {
        role: "assistant",
        content: `Reading it first.\n\n${call("read_text_file", '{"path":"/p/a.md"}')}\n${call("get_file_info", '{"path":"/p/a.md"}')}`,
      },
      {
        role: "user",
        content: results(
          result("read_text_file", "# Kit"),
          result("get_file_info", "size: 5")
        ),
      },
      { role: "assistant", content: "Done." },
    ]);

    expect(wire).toEqual([
      { role: "user", content: "add a section" },
      {
        role: "assistant",
        content: "Reading it first.",
        tool_calls: [
          {
            id: "call_1_0",
            type: "function",
            function: {
              name: "read_text_file",
              arguments: '{"path":"/p/a.md"}',
            },
          },
          {
            id: "call_1_1",
            type: "function",
            function: {
              name: "get_file_info",
              arguments: '{"path":"/p/a.md"}',
            },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_1_0",
        content: "<result>\n# Kit\n</result>",
      },
      {
        role: "tool",
        tool_call_id: "call_1_1",
        content:
          "<result>\nsize: 5\n</result>\n\nIf you need another tool to finish the request, call it now.",
      },
      { role: "assistant", content: "Done." },
    ]);
  });

  it("leaves a pair as text when its calls and results do not line up", () => {
    const reply = {
      role: "assistant" as const,
      content: call("read_text_file", '{"path":"/p/a.md"}'),
    };
    const unparsable = {
      role: "assistant" as const,
      content: call("read_text_file", '{"path":"/p/a.md'),
    };
    const answer = {
      role: "user" as const,
      content: results(result("read_text_file", "# Kit")),
    };
    const wrongTool = {
      role: "user" as const,
      content: results(result("write_file", "ok")),
    };

    expect(nativeHistory([reply, wrongTool])).toEqual([reply, wrongTool]);
    expect(nativeHistory([unparsable, answer])).toEqual([unparsable, answer]);
    expect(nativeHistory([reply])).toEqual([reply]);
  });
});
