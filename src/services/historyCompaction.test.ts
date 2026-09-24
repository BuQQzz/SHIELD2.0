import { describe, expect, it } from "vitest";
import { compactHistory, shouldCompact } from "./historyCompaction";

const bigFile = "const x = 1;\n".repeat(400); // ~5k characters

const writeCall = (path: string, content: string) =>
  `Now let me write ${path}:\n\n<tool_call>\n<server>filesystem</server>\n<tool>write_file</tool>\n<arguments>${JSON.stringify({ path, content })}</arguments>\n</tool_call>`;

const readResult = (body: string) =>
  `You executed 1 tool call(s). Here are the results:\n\n<tool_result trusted="false">\n<tool>read_text_file</tool>\n<result>\n${body}\n</result>\n</tool_result>`;

describe("compactHistory", () => {
  it("clears old file contents but keeps what was done", () => {
    const history = [
      { role: "user" as const, content: "build it" },
      { role: "assistant" as const, content: writeCall("server.js", bigFile) },
      { role: "user" as const, content: readResult(bigFile) },
      { role: "assistant" as const, content: "Done." },
    ];

    const { history: out, savedChars } = compactHistory(history, 1);

    expect(savedChars).toBeGreaterThan(9000);
    // The step is still there, with its path, minus the content
    expect(out[1]!.content).toContain("Now let me write server.js");
    expect(out[1]!.content).toContain("<tool>write_file</tool>");
    expect(out[1]!.content).toContain('"path":"server.js"');
    expect(out[1]!.content).toContain("cleared to save space");
    expect(out[1]!.content).not.toContain("const x = 1;");
    // The read result keeps its envelope
    expect(out[2]!.content).toContain("<tool>read_text_file</tool>");
    expect(out[2]!.content).toContain("Run the tool again");
    expect(out[2]!.content).not.toContain("const x = 1;");
  });

  it("leaves the most recent entries untouched", () => {
    const history = [
      { role: "assistant" as const, content: writeCall("a.js", bigFile) },
      { role: "user" as const, content: readResult(bigFile) },
    ];
    const { history: out } = compactHistory(history, 2);
    expect(out).toEqual(history);
  });

  it("leaves short calls and results alone", () => {
    const history = [
      { role: "assistant" as const, content: writeCall("a.txt", "hi") },
      { role: "user" as const, content: readResult("small") },
      { role: "assistant" as const, content: "ok" },
    ];
    const { history: out, savedChars } = compactHistory(history, 1);
    expect(savedChars).toBe(0);
    expect(out).toEqual(history);
  });

  it("clears an unfinished call that was cut off", () => {
    const cut = `Writing it:\n\n<tool_call>\n<server>filesystem</server>\n<tool>write_file</tool>\n<arguments>{"path":"b.js","content":"${"x".repeat(3000)}`;
    const { history: out } = compactHistory(
      [
        { role: "assistant", content: cut },
        { role: "user", content: "continue" },
      ],
      1
    );
    expect(out[0]!.content).toContain("Writing it:");
    expect(out[0]!.content).toContain("never ran");
    expect(out[0]!.content.length).toBeLessThan(200);
  });

  it("does nothing more the second time", () => {
    const history = [
      { role: "assistant" as const, content: writeCall("a.js", bigFile) },
      { role: "user" as const, content: "next" },
    ];
    const once = compactHistory(history, 1).history;
    const twice = compactHistory(once, 1);
    expect(twice.savedChars).toBe(0);
    expect(twice.history).toEqual(once);
  });
});

describe("shouldCompact", () => {
  it("fires once the prompt would pass 60% of the window", () => {
    expect(shouldCompact(10_000, 300, 32_768)).toBe(false);
    expect(shouldCompact(20_000, 300, 32_768)).toBe(true);
  });
});
