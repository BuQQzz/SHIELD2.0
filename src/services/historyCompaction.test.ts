import { describe, expect, it } from "vitest";
import {
  compactHistory,
  isRemovalNote,
  shouldCompact,
  stripRemovalNotes,
} from "./historyCompaction";

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
    // The content is dropped from the call itself. A placeholder inside
    // the call was copied by Qwen3-Coder into write_file as if it were
    // content (2026-09-28); a note after it, in the model's own turn, was
    // copied by Bonsai 2 into its replies (2026-11-09). The note opens the
    // next message instead.
    expect(out[1]!.content).toMatch(
      /<arguments>\{"path":"server\.js"\}<\/arguments>\n<\/tool_call>$/
    );
    expect(isRemovalNote(out[1]!.content)).toBe(false);
    expect(out[2]!.content).toMatch(
      /^\[SHIELD removed from your context to save space: 5,200 characters of long text .*not from the files/
    );
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
    expect(out[0]!.content).toBe("Writing it:");
    expect(out[1]!.content).toMatch(/unfinished tool call .* It never ran\.\]\n\ncontinue$/);
  });

  it("drops long edit texts but keeps the call's shape", () => {
    const edit = `<tool_call>\n<server>filesystem</server>\n<tool>edit_file</tool>\n<arguments>${JSON.stringify({ path: "a.js", edits: [{ oldText: bigFile, newText: bigFile }] })}</arguments>\n</tool_call>`;
    const { history: out } = compactHistory(
      [
        { role: "assistant", content: edit },
        { role: "user", content: "next" },
      ],
      1
    );
    expect(out[0]!.content).toContain(
      '<arguments>{"path":"a.js","edits":[{}]}</arguments>'
    );
    expect(isRemovalNote(out[0]!.content)).toBe(false);
    expect(isRemovalNote(out[1]!.content)).toBe(true);
  });

  it("takes old notes, and ones the model copied, out of its turns", () => {
    const copied =
      "Let me look:\n\n[SHILD removed from your context to save space: 247 characters of the call above. The call already ran.]";
    const { history: out } = compactHistory(
      [
        { role: "assistant", content: copied },
        { role: "user", content: "next" },
        { role: "assistant", content: "ok" },
      ],
      1
    );
    expect(out[0]!.content).toBe("Let me look:");
    expect(out[1]!.content).toBe("next");
    expect(stripRemovalNotes(copied)).toBe("Let me look:");
  });

  it("recognises its notes, this version's and older ones", () => {
    expect(isRemovalNote("[2,450 characters, cleared to save space]")).toBe(
      true
    );
    expect(
      isRemovalNote(
        "[SHIELD removed from your context to save space: 12 characters]"
      )
    ).toBe(true);
    expect(isRemovalNote("const cleared = true; // save space")).toBe(false);
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
