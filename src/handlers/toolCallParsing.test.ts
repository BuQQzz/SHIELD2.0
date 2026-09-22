import { describe, expect, it } from "vitest";
import { extractToolCalls } from "./toolCallParsing";

/**
 * Regression cases captured from Qwen3-Coder-30B running locally. Each one
 * previously extracted zero tool calls and silently did nothing.
 */
describe("formats observed from real model output", () => {
  it("name plus nested arguments (plan mode, 2026-09-21)", () => {
    const raw = `<tool_call>
<name>list_directory</name>
<arguments>
<path>C:\\Users\\imend\\Desktop</path>
</arguments>
</tool_call>`;

    const calls = extractToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe("list_directory");
  });

  it("body and closing tag with no opener (read-only mode, 2026-09-21)", () => {
    const raw = `I'll read the file.

<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path":"C:\\Users\\imend\\Desktop\\test.txt"}</arguments>
</tool_call>`;

    const calls = extractToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe("read_file");
  });

  it("every captured format yields exactly one call", () => {
    const formats = [
      `<tool_call>\n<server>filesystem</server>\n<tool>read_file</tool>\n<arguments>{"path":"C:/a.txt"}</arguments>\n</tool_call>`,
      `<tool_call>\n<name>read_file</name>\n<arguments>\n<path>C:/a.txt</path>\n</arguments>\n</tool_call>`,
      `<server>filesystem</server>\n<tool>read_file</tool>\n<arguments>{"path":"C:/a.txt"}</arguments>\n</tool_call>`,
      '```json\n{"tool_calls":[{"function":{"name":"filesystem.read_file","arguments":{"path":"C:/a.txt"}}}]}\n```',
    ];

    for (const format of formats) {
      const calls = extractToolCalls(format);
      expect(calls.length, `format failed to parse:\n${format}`).toBe(1);
      expect(calls[0]?.tool).toBe("read_file");
    }
  });
});
