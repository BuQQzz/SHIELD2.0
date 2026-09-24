import { describe, expect, it } from "vitest";
import {
  cutOffToolCall,
  dropTrailingClosers,
  escapeStrayQuotes,
  extractToolCalls,
  repairJsonStrings,
  stripToolCallMarkup,
  streamingToolCallPreview,
} from "./toolCallParsing";

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

  it("JSON arguments whose content is HTML (write_file, 2026-09-24)", () => {
    const raw = `<tool_call>
<server>filesystem</server>
<tool>write_file</tool>
<arguments>{"path":"C:\\\\p\\\\index.html","content":"<!DOCTYPE html>\\n<html>\\n<head>\\n<title>T</title>\\n</head>\\n<body>\\n<h1>Hi</h1>\\n</body>\\n</html>"}</arguments>
</tool_call>`;

    const calls = extractToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.argumentsError).toBeUndefined();
    expect(calls[0]?.arguments.path).toBe("C:\\p\\index.html");
    expect(calls[0]?.arguments.content).toContain("<h1>Hi</h1>");
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

describe("call bodies with no tool_call tags", () => {
  it("accepts a bare body inside a markdown fence (Qwen2.5, 2026-09-22)", () => {
    const raw =
      String.raw`Let's proceed by reading the content of the markdown file.
` +
      "```markdown\n" +
      String.raw`<server>filesystem</server>
<tool>read_text_file</tool>
<arguments>{"path":"C:\\notes\\meeting.md"}</arguments>
` +
      "```";

    const calls = extractToolCalls(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe("read_text_file");
    expect(calls[0]?.arguments.path).toContain("meeting.md");
  });

  it("leaves prose that only mentions a tag alone", () => {
    const raw =
      "Use the <tool> element to name the tool; no call is being made here.";
    expect(extractToolCalls(raw)).toEqual([]);
  });
});

/**
 * Captured by the agent benchmark (Qwen3-Coder-30B, read-file task,
 * 2026-09-22). The model quoted the file it had read; the parser ran a tool
 * called "orchid" three times and the model apologised for calling it.
 */
describe("JSON that is data, not a tool call", () => {
  it("ignores quoted JSON that merely has a name field", () => {
    const reply =
      'The file contains:\n\n```json\n{\n  "name": "orchid",\n  "port": 48213,\n  "debug": false\n}\n```\n\nThe configured port is **48213**.';
    expect(extractToolCalls(reply)).toEqual([]);
  });

  it("ignores a quoted package.json", () => {
    const reply =
      '```json\n{"name": "shield2.0", "version": "0.1.5", "scripts": {"dev": "vite"}}\n```';
    expect(extractToolCalls(reply)).toEqual([]);
  });

  it("ignores arrays of records with names", () => {
    const reply = '```json\n[{"name": "Ana"}, {"name": "Raj"}]\n```';
    expect(extractToolCalls(reply)).toEqual([]);
  });

  it("still accepts bare name + arguments calls", () => {
    const reply =
      '```json\n{"name": "filesystem.read_file", "arguments": {"path": "C:/a.txt"}}\n```';
    expect(extractToolCalls(reply)[0]?.tool).toBe("read_file");
  });

  it("still accepts argument-less calls inside tool_calls", () => {
    const reply =
      '```json\n{"tool_calls": [{"name": "filesystem.list_allowed_directories"}]}\n```';
    expect(extractToolCalls(reply)[0]?.tool).toBe("list_allowed_directories");
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

describe("streamingToolCallPreview", () => {
  it("holds back a call that is still being written", () => {
    const partial =
      "Let me look.\n\n<tool_call>\n<server>filesystem</server>\n<tool>list_dir";
    const { text, pendingTool } = streamingToolCallPreview(partial);
    expect(text).toBe("Let me look.");
    expect(pendingTool).toBe("");
  });

  it("names the tool once it has been written", () => {
    const partial =
      'Checking.\n<server>filesystem</server>\n<tool>list_directory</tool>\n<arguments>{"pa';
    const { text, pendingTool } = streamingToolCallPreview(partial);
    expect(text).toBe("Checking.");
    expect(pendingTool).toBe("list_directory");
  });

  it("hides a tag that is only half typed", () => {
    const { text, pendingTool } = streamingToolCallPreview(
      "One moment <tool_ca"
    );
    expect(text).toBe("One moment");
    expect(pendingTool).toBeNull();
  });

  it("shows text after a finished call normally", () => {
    const done =
      "<tool_call>\n<tool>read_file</tool>\n<arguments>{}</arguments>\n</tool_call>\nThe file says hi.";
    const { text, pendingTool } = streamingToolCallPreview(done);
    expect(text).toBe("The file says hi.");
    expect(pendingTool).toBeNull();
  });

  it("leaves ordinary text alone", () => {
    const { text, pendingTool } = streamingToolCallPreview("Use x < 3 here");
    expect(text).toBe("Use x < 3 here");
    expect(pendingTool).toBeNull();
  });
});

describe("stripToolCallMarkup", () => {
  it("removes a tagless call body and its empty fence", () => {
    const raw =
      'Reading it now.\n```markdown\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"C:/a.md"}</arguments>\n```';
    expect(stripToolCallMarkup(raw)).toBe("Reading it now.");
  });
});

describe("cutOffToolCall", () => {
  it("stands in for a call the reply ended inside (token limit, 2026-09-24)", () => {
    const raw = `Now let's enhance our app.js file:

<tool_call>
<server>filesystem</server>
<tool>edit_file</tool>
<arguments>{"path":"app.js","edits":[{"oldText":"class WebSearcher {\n    constructor() {`;

    expect(extractToolCalls(raw)).toHaveLength(0);
    const call = cutOffToolCall(raw);
    expect(call?.tool).toBe("edit_file");
    expect(call?.argumentsError).toMatch(/^The tool call was cut off/);
  });

  it("ignores a reply whose calls are all complete", () => {
    const raw = `<tool_call>
<tool>list_directory</tool>
<arguments>{"path":"."}</arguments>
</tool_call>
Done.`;
    expect(cutOffToolCall(raw)).toBeNull();
  });

  it("ignores prose that mentions a tag", () => {
    expect(
      cutOffToolCall("Use the <tool> element to name the tool.")
    ).toBeNull();
  });
});

describe("unescaped quotes inside string values", () => {
  it("recovers HTML quotes in a JS template literal (write_file, 2026-09-24)", () => {
    const raw = `<tool_call>
<server>filesystem</server>
<tool>write_file</tool>
<arguments>{"path":"app.js","content":"el.innerHTML = \`\n  <img src="\${item.url}" alt="\${item.title}">\n\`;\nf(\\"a\\", \\"b\\");"}</arguments>
</tool_call>`;

    const [call] = extractToolCalls(raw);
    expect(call?.argumentsError).toBeUndefined();
    expect(call?.arguments.path).toBe("app.js");
    expect(call?.arguments.content).toContain(
      '<img src="${item.url}" alt="${item.title}">'
    );
  });

  it("keeps quotes that look like a second argument as text", () => {
    expect(escapeStrayQuotes('{"c":"f("a", "b")"}')).toBe(
      '{"c":"f(\\"a\\", \\"b\\")"}'
    );
  });

  it("leaves real closing quotes alone", () => {
    const json = '{"a":"x","b":["p","q"],"c":1}';
    expect(escapeStrayQuotes(json)).toBe(json);
  });
});

describe("edit_file key aliases", () => {
  const edit = (edits: string) =>
    extractToolCalls(`<tool_call>
<server>filesystem</server>
<tool>edit_file</tool>
<arguments>{"path":"a.css","edits":${edits}}</arguments>
</tool_call>`)[0]?.arguments.edits;

  it("maps replace/with (Qwen3-Coder, 2026-09-24)", () => {
    expect(edit('[{"replace":"a","with":"b"}]')).toEqual([
      { oldText: "a", newText: "b" },
    ]);
  });

  it("maps search/replace, where replace is the new text", () => {
    expect(edit('[{"search":"a","replace":"b"}]')).toEqual([
      { oldText: "a", newText: "b" },
    ]);
  });

  it("leaves correct edits alone", () => {
    expect(edit('[{"oldText":"a","newText":"b"}]')).toEqual([
      { oldText: "a", newText: "b" },
    ]);
  });
});

describe("stray closing brackets after the arguments", () => {
  it("accepts a valid object with one extra brace (write_file, 2026-09-24)", () => {
    const raw = `<tool_call>
<server>filesystem</server>
<tool>write_file</tool>
<arguments>{"path":"setup.sh","content":"echo \\"hi\\"\n"}
}</arguments>
</tool_call>`;
    const [call] = extractToolCalls(raw);
    expect(call?.argumentsError).toBeUndefined();
    expect(call?.arguments.path).toBe("setup.sh");
  });

  it("does not drop real content after the object", () => {
    expect(dropTrailingClosers('{"a":1} trailing')).toBeNull();
    expect(dropTrailingClosers('{"a":1}}]')).toBe('{"a":1}');
  });
});
