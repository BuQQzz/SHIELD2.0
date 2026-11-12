import { describe, expect, it } from "vitest";
import {
  compactHistory,
  compactStaleReads,
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

describe("cleared reads of code", () => {
  it("keep the definitions they showed", () => {
    const py = [
      "import json",
      "def load_data(path: Path) -> dict:",
      "    return json.loads(path.read_text())",
      "class Budget:",
      "    def check(self, amount):",
      "        pass",
      "async function fetchRates() {",
      "export const total = (items) => items.length;",
      ...Array(200).fill("    x = 1"),
    ].join("\n");
    const history = [
      { role: "user" as const, content: "build it" },
      { role: "assistant" as const, content: "Reading." },
      { role: "user" as const, content: readResult(py) },
      { role: "assistant" as const, content: "Done." },
    ];
    const out = compactHistory(history, 1).history[2]!.content;
    expect(out).toContain("It showed these definitions");
    expect(out).toContain("def load_data(path: Path) -> dict\n");
    expect(out).toContain("class Budget\n");
    expect(out).toContain("def check(self, amount)");
    expect(out).toContain("async function fetchRates()");
    expect(out).toContain("export const total = (items) => items.length;");
    expect(out).not.toContain("x = 1");
    expect(out).not.toContain("import json");
  });

  // g33: a note with many definitions passed the 400-character mark and
  // was cleared again at every later clearing, changing early results by a
  // few characters each time and costing the server a re-read (2026-11-12)
  it("are left alone once cleared, also by stale-read clearing", () => {
    const py = Array.from({ length: 40 }, (_, i) => `def step_${i}(rows):\n    return rows`).join("\n");
    const readCall = `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/p/spend.py"}</arguments>\n</tool_call>`;
    const history = [
      { role: "user" as const, content: "build it" },
      { role: "assistant" as const, content: readCall },
      { role: "user" as const, content: readResult(py) },
      { role: "assistant" as const, content: "Done." },
    ];
    const once = compactHistory(history, 1).history;
    expect(once[2]!.content.length).toBeGreaterThan(400);
    const twice = compactHistory(once, 1);
    expect(twice.savedChars).toBe(0);
    expect(twice.history[2]).toBe(once[2]);
    // read again later: the cleared copy is not rewritten as an older read
    const later = [...once, { role: "assistant" as const, content: readCall }, { role: "user" as const, content: readResult(py) }, { role: "assistant" as const, content: "Done." }];
    const stale = compactStaleReads(later);
    expect(stale.history[2]).toBe(later[2]);
  });

  it("say nothing extra for text that is not code", () => {
    const history = [
      { role: "user" as const, content: "build it" },
      { role: "assistant" as const, content: "Reading." },
      { role: "user" as const, content: readResult("some notes\n".repeat(100)) },
      { role: "assistant" as const, content: "Done." },
    ];
    expect(compactHistory(history, 1).history[2]!.content).not.toContain(
      "definitions"
    );
  });
});

describe("compactStaleReads", () => {
  const readCall = (args: Record<string, unknown>) =>
    `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`;
  const v1 = "def old_version():\n" + "    pass\n".repeat(100);
  const v2 = "def new_version():\n" + "    pass\n".repeat(100);

  it("clears a read the model has since read again, and only that", () => {
    const history = [
      { role: "user" as const, content: "build it" },
      { role: "assistant" as const, content: readCall({ path: "/p/spend.py" }) },
      { role: "user" as const, content: readResult(v1) },
      { role: "assistant" as const, content: readCall({ path: "/p/other.py" }) },
      { role: "user" as const, content: readResult(v1) },
      { role: "assistant" as const, content: readCall({ path: "/p/spend.py" }) },
      { role: "user" as const, content: readResult(v2) },
      { role: "assistant" as const, content: "Done." },
    ];
    const { history: out, savedChars } = compactStaleReads(history);
    expect(savedChars).toBeGreaterThan(500);
    expect(out[2]!.content).toContain("an older read of spend.py. You read those lines again later");
    expect(out[2]!.content).not.toContain("old_version");
    // other.py was read once; the latest spend.py read stays
    expect(out[4]).toBe(history[4]);
    expect(out[6]).toBe(history[6]);
  });

  it("keeps a part of a file that the later read did not show", () => {
    const history = [
      { role: "user" as const, content: "build it" },
      { role: "assistant" as const, content: readCall({ path: "/p/spend.py", tail: 100 }) },
      { role: "user" as const, content: readResult(v1) },
      { role: "assistant" as const, content: readCall({ path: "/p/spend.py", head: 40 }) },
      { role: "user" as const, content: readResult(v2) },
      { role: "assistant" as const, content: "Done." },
    ];
    expect(compactStaleReads(history).savedChars).toBe(0);
    // a later tail at least as long covers a tail (g5: 370, 372, 374)
    history[3] = { role: "assistant", content: readCall({ path: "/p/spend.py", tail: 120 }) };
    expect(compactStaleReads(history).savedChars).toBeGreaterThan(500);
    history[3] = { role: "assistant", content: readCall({ path: "/p/spend.py", tail: 50 }) };
    expect(compactStaleReads(history).savedChars).toBe(0);
    // ... and a whole-file read covers it
    history[3] = { role: "assistant", content: readCall({ path: "/p/spend.py" }) };
    expect(compactStaleReads(history).savedChars).toBeGreaterThan(500);
  });

  const cmd = (command: string) =>
    `<tool_call>\n<server>terminal</server>\n<tool>run_command</tool>\n<arguments>${JSON.stringify({ command, reason: "look" })}</arguments>\n</tool_call>`;
  const out = (body: string) =>
    `You executed 1 tool call(s). Here are the results:\n\n<tool_result trusted="false">\n<tool>run_command</tool>\n<result>\n${body}\n</result>\n</tool_result>`;
  const session = (first: string, second: string) => [
    { role: "user" as const, content: "add it" },
    { role: "assistant" as const, content: cmd(first) },
    { role: "user" as const, content: out(v1) },
    { role: "assistant" as const, content: cmd(second) },
    { role: "user" as const, content: out(v2) },
    { role: "assistant" as const, content: "Done." },
  ];
  const cleared = (first: string, second: string) =>
    compactStaleReads(session(first, second)).savedChars > 0;

  it("counts sed, awk and cat reads in commands (g8-g10)", () => {
    const at = "cd /p/project && ";
    // g10: 640-760, then 700-835 does not cover 640-699
    expect(cleared(`${at}sed -n '640,760p' spend.py`, `${at}sed -n '700,835p' spend.py`)).toBe(false);
    expect(cleared(`${at}sed -n '700,760p' spend.py`, `${at}sed -n '640,835p' spend.py`)).toBe(true);
    // several ranges, covered by several later ones together
    expect(cleared(`sed -n '397,458p;567,634p' spend.py`, `sed -n '390,460p;560,640p' spend.py`)).toBe(true);
    // g10: the same awk span twice
    expect(cleared("awk '/^def cmd_list/,/^def cmd_summary/' spend.py", "awk '/^def cmd_list/,/^def cmd_summary/' spend.py")).toBe(true);
    // a whole read covers any part, by full path or by name
    expect(cleared(`${at}sed -n '458,526p' spend.py`, "cat /p/project/spend.py")).toBe(true);
    expect(cleared(`${at}echo "=== status ===" && sed -n '1,9p' spend.py`, `${at}cat spend.py`)).toBe(true);
  });

  it("keeps a command that did more than show the file", () => {
    expect(cleared("python3 -m py_compile spend.py && sed -n '1,9p' spend.py", "cat spend.py")).toBe(false);
    expect(cleared("sed -n '490,516p' spend.py | cat -A | head -30", "cat spend.py")).toBe(false);
    expect(cleared("grep -n def spend.py", "cat spend.py")).toBe(false);
    expect(cleared("sed -n '1,9p' spend.py", "cat other.py")).toBe(false);
    expect(cleared("sed -i '1,9d' spend.py", "cat spend.py")).toBe(false);
  });

  it("never touches the results the model is about to see", () => {
    const history = [
      { role: "user" as const, content: "build it" },
      { role: "assistant" as const, content: readCall({ path: "/p/spend.py" }) },
      { role: "user" as const, content: readResult(v1) },
    ];
    expect(compactStaleReads(history).savedChars).toBe(0);
  });
});

describe("shouldCompact", () => {
  it("fires once the prompt would pass 60% of the window", () => {
    expect(shouldCompact(10_000, 300, 32_768)).toBe(false);
    expect(shouldCompact(20_000, 300, 32_768)).toBe(true);
  });
});
