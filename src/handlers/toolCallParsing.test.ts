import { describe, expect, it } from "vitest";
import { extractToolCalls, repairJsonStrings } from "./toolCallParsing";

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

/**
 * Captured by the agent benchmark (Qwen2.5-7B, edit-file task, 2026-09-22).
 * Multi-line values arrive with raw line breaks inside JSON strings. These
 * used to parse to `{}` and the call still ran, so the tool reported a
 * missing path and the model never learned what was wrong.
 */
describe("arguments that are not strict JSON", () => {
  it("repairs raw line breaks inside JSON strings", () => {
    const raw = String.raw`<tool_call>
<server>filesystem</server>
<tool>edit_file</tool>
<arguments>{"path": "C:\\tmp\\settings.ini", "edits": [{"oldText": "[ui]
theme=light", "newText": "[ui]
theme=dark"}]}</arguments>
</tool_call>`;

    const [call] = extractToolCalls(raw);
    expect(call?.argumentsError).toBeUndefined();
    expect(call?.arguments).toMatchObject({
      edits: [{ oldText: "[ui]\ntheme=light", newText: "[ui]\ntheme=dark" }],
    });
  });

  it("repairs single backslashes in Windows paths", () => {
    // \n or \t after a backslash is a legal JSON escape and stays ambiguous;
    // this covers the unambiguous case (\U, \D) that used to fail outright.
    const raw = String.raw`<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path": "C:\Users\Test\Documents\data.md"}</arguments>
</tool_call>`;

    const [call] = extractToolCalls(raw);
    expect(call?.argumentsError).toBeUndefined();
    expect(String(call?.arguments.path)).toMatch(
      /Users.Test.Documents.data\.md$/
    );
  });

  it("repairs line breaks in OpenAI-style JSON blocks", () => {
    const raw =
      '```json\n{"tool_calls":[{"function":{"name":"filesystem.write_file","arguments":{"path":"C:/a.txt","content":"line one\nline two"}}}]}\n```';

    const [call] = extractToolCalls(raw);
    expect(call?.arguments.content).toBe("line one\nline two");
  });

  it("accepts arguments with no closing tag", () => {
    // Verbatim from Qwen2.5-7B: the JSON runs straight into </tool_call>.
    const raw = String.raw`<tool_call>
<server>filesystem</server>
<tool>edit_file</tool>
<arguments>{"path":"C:\\tmp\\settings.ini","edits":[{"oldText":"theme=light","newText":"theme=dark"}],"dryRun":false}
</tool_call>`;

    const [call] = extractToolCalls(raw);
    expect(call?.argumentsError).toBeUndefined();
    expect(call?.arguments).toMatchObject({
      edits: [{ oldText: "theme=light", newText: "theme=dark" }],
    });
  });

  it("flags unrecoverable arguments instead of returning an empty object", () => {
    const raw = `<tool_call>
<server>filesystem</server>
<tool>read_file</tool>
<arguments>{"path": "C:/a.txt",</arguments>
</tool_call>`;

    const [call] = extractToolCalls(raw);
    expect(call?.tool).toBe("read_file");
    expect(call?.argumentsError).toMatch(/not valid JSON/);
  });

  it("does not flag tools called with no arguments", () => {
    const raw = `<tool_call>
<server>filesystem</server>
<tool>list_allowed_directories</tool>
<arguments>{}</arguments>
</tool_call>`;

    const [call] = extractToolCalls(raw);
    expect(call?.argumentsError).toBeUndefined();
  });
});

describe("repairJsonStrings", () => {
  it("leaves valid JSON unchanged", () => {
    const valid = String.raw`{"a":"x\ny","b":[1,2],"c":"C:\\dir","d":"\u00e9"}`;
    expect(repairJsonStrings(valid)).toBe(valid);
  });

  it("does not touch whitespace outside strings", () => {
    expect(JSON.parse(repairJsonStrings('{\n  "a": "b\nc"\n}'))).toEqual({
      a: "b\nc",
    });
  });
});
