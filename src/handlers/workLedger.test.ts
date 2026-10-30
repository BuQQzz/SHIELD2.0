import { beforeEach, describe, expect, it } from "vitest";
import type { Message } from "@/types/conversation";
import { formatToolResult } from "./mcpToolHandler";
import {
  containsLines,
  failedEdits,
  forgetLedgerSent,
  isApplied,
  ledgerEntries,
  readFailedEditFiles,
  recordNoteFor,
  ledgerNote,
  MAX_LEDGER_ENTRIES,
  modelWrittenFiles,
  takeLedgerNote,
} from "./workLedger";

const WORKSPACE = String.raw`C:\Users\me\wifi`;
let id = 0;

const call = (
  tool: string,
  args: Record<string, unknown>,
  server = "filesystem"
) =>
  `<tool_call>\n<server>${server}</server>\n<tool>${tool}</tool>\n<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`;

const assistant = (...calls: string[]): Message => ({
  id: String(id++),
  role: "assistant",
  content: calls.join("\n"),
  timestamp: new Date(),
});

/** A tool-result message as mcpMessageHandler stores it */
const result = (
  tool: string,
  outcome: {
    success: boolean;
    data?: unknown;
    error?: string;
    blocked?: boolean;
  },
  target?: string,
  content?: string
): Message => ({
  id: String(id++),
  role: "user",
  content:
    content ??
    formatToolResult(
      { serverName: "filesystem", tool, arguments: {} },
      outcome
    ),
  timestamp: new Date(),
  toolResult: {
    tool,
    serverName: "filesystem",
    success: outcome.success,
    blocked: outcome.blocked,
    target,
  },
});

const text = (value: string) => ({
  success: true,
  data: { content: [{ type: "text", text: value }] },
});

const user = (content: string): Message => ({
  id: String(id++),
  role: "user",
  content,
  timestamp: new Date(),
});

// The wifi session, 2026-09-27/28: one edit applied, one never matched -
// and the model went on to say both fixes were applied
const freeData = { oldText: "function FreeData($p) {", newText: "..." };
const guid = {
  oldText:
    "# --- 2. Enum interfaces (correct signature: pReserved, out list ptr) ---\n$list = 0",
  newText: "...",
};
const session: Message[] = [
  user("apply these fixes"),
  assistant(call("edit_file", { path: "set-radio.ps1", edits: [freeData] })),
  result("edit_file", text("```diff\n+ fixed\n```"), "set-radio.ps1"),
  assistant(call("edit_file", { path: "set-radio.ps1", edits: [guid] })),
  result(
    "edit_file",
    { success: false, error: "Could not find exact match for edit:\n# --- 2." },
    "set-radio.ps1"
  ),
  assistant(call("edit_file", { path: "set-radio.ps1", edits: [guid] })),
  result(
    "edit_file",
    { success: false, error: "Could not find exact match" },
    "set-radio.ps1",
    "This exact call (edit_file) already failed in this turn and would fail the same way, so it was not run again."
  ),
  user("document them and proceed"),
  assistant(
    call("write_file", { path: `${WORKSPACE}\\FIXES.md`, content: "x" })
  ),
  result("write_file", text("Successfully wrote"), `${WORKSPACE}\\FIXES.md`),
  assistant(
    call(
      "run_command",
      { command: "powershell -File set-radio.ps1", reason: "Runs it" },
      "terminal"
    ),
    call(
      "run_command",
      { command: "powershell -File diag.ps1", reason: "Runs it" },
      "terminal"
    )
  ),
  result(
    "run_command",
    text("Exit code 1 · 1.0 s\nSelect-Object : A parameter cannot be found")
  ),
  result(
    "run_command",
    text(
      "Exit code 0 · 1.6 s\nERR: 404\n\n[Exit code 0, but 3 lines of the output look like failures. ...]"
    )
  ),
];

describe("ledgerEntries", () => {
  it("records each change and command as it turned out", () => {
    expect(ledgerEntries(session, WORKSPACE)).toEqual([
      "edited set-radio.ps1",
      'edit of set-radio.ps1 FAILED - nothing changed (Could not find exact match for edit:); it tried to replace text starting "# --- 2. Enum interfaces (correct signature: pReserved, o..."',
      "wrote FIXES.md",
      "ran `powershell -File set-radio.ps1` - exit 1",
      "ran `powershell -File diag.ps1` - exit 0, but 3 lines looked like failures",
    ]);
  });

  it("leaves out reads, web searches and calls bounced before running", () => {
    const messages = [
      assistant(call("read_text_file", { path: "a.ps1" })),
      result("read_text_file", text("contents"), "a.ps1"),
      assistant(call("run_command", { command: "npm test" }, "terminal")),
      result("run_command", {
        success: false,
        error:
          'Not run: a command that needs the user\'s approval must include "reason"',
      }),
    ];
    expect(ledgerEntries(messages)).toEqual([]);
  });

  it("says what the user declined and what a mode kept from happening", () => {
    const messages = [
      assistant(
        call("delete_file", { path: "old.ps1" }),
        call("write_file", { path: "plan.md", content: "x" })
      ),
      result(
        "delete_file",
        { success: false, error: "User denied permission" },
        "old.ps1"
      ),
      result(
        "write_file",
        {
          success: false,
          blocked: true,
          error:
            "Plan mode: 'write_file' was NOT executed and has been recorded as a step in your plan.",
        },
        "plan.md"
      ),
      assistant(
        call("run_command", { command: "npm run dev", reason: "x" }, "terminal")
      ),
      result("run_command", {
        success: false,
        error: "Stopped after 120 s: the command did not finish.",
      }),
    ];
    expect(ledgerEntries(messages)).toEqual([
      "delete of old.ps1 - declined by the user, not done",
      "write of plan.md - planned only, not done",
      "`npm run dev` - did not finish: Stopped after 120 s: the command did not finish.",
    ]);
  });

  it("counts a change repeated in a row instead of listing it again", () => {
    const write = () => [
      assistant(call("write_file", { path: "a.md", content: "x" })),
      result("write_file", text("ok"), "a.md"),
    ];
    expect(ledgerEntries([...write(), ...write(), ...write()])).toEqual([
      "wrote a.md (3 times)",
    ]);
  });
});

describe("ledgerNote", () => {
  it("is empty without entries", () => {
    expect(ledgerNote([])).toBe("");
  });

  it("puts the record above the model's own replies", () => {
    const note = ledgerNote(["edited a.ps1"]);
    expect(note).toMatch(/^\[SHIELD's record of the changes and commands/);
    expect(note).toContain("not from your replies");
    expect(note).toContain("this record is right");
    expect(note).toMatch(/\n- edited a\.ps1\]$/);
  });

  it("keeps the latest entries and counts the rest", () => {
    const entries = Array.from(
      { length: MAX_LEDGER_ENTRIES + 3 },
      (_, i) => `wrote f${i}.md`
    );
    const note = ledgerNote(entries);
    expect(note).toContain("- (3 earlier entries not listed)");
    expect(note).not.toContain("wrote f2.md\n");
    expect(note).toContain(`wrote f${MAX_LEDGER_ENTRIES + 2}.md`);
  });
});

describe("takeLedgerNote", () => {
  beforeEach(() => forgetLedgerSent());

  it("sends the record once, and again only when it changes", () => {
    const first = takeLedgerNote("c1", session, WORKSPACE);
    expect(first).toContain("edit of set-radio.ps1 FAILED");
    expect(takeLedgerNote("c1", session, WORKSPACE)).toBe("");

    const more = [
      ...session,
      assistant(call("write_file", { path: "b.md", content: "x" })),
      result("write_file", text("ok"), "b.md"),
    ];
    expect(takeLedgerNote("c1", more, WORKSPACE)).toContain("wrote b.md");
  });

  it("sends it again after the model's history is rebuilt", () => {
    takeLedgerNote("c1", session, WORKSPACE);
    forgetLedgerSent("c1");
    expect(takeLedgerNote("c1", session, WORKSPACE)).not.toBe("");
  });

  it("sends nothing for a conversation without changes or commands", () => {
    expect(takeLedgerNote("c2", [user("hi")], WORKSPACE)).toBe("");
  });
});

describe("checking failed edits against the file", () => {
  // set-radio.ps1 as it is: the GUID code the failed edit meant to replace
  const now = [
    "function FreeData($p) {",
    "    try { ... }",
    "}",
    "# --- 2. Enum interfaces (correct signature: pReserved, out list ptr) ---",
    "$list = 0",
  ].join("\r\n");
  const guidFix = {
    oldText: guid.oldText,
    newText: "# --- 2. Enum interfaces ---\n$list = 1",
  };
  const withFix = [
    user("fix the GUID"),
    assistant(call("edit_file", { path: "set-radio.ps1", edits: [guidFix] })),
    result(
      "edit_file",
      { success: false, error: "Could not find exact match for edit:" },
      "set-radio.ps1"
    ),
  ];

  it("finds each failed edit once", () => {
    expect(failedEdits([...withFix, ...withFix])).toEqual([
      {
        path: "set-radio.ps1",
        oldTexts: [guidFix.oldText],
        newTexts: [guidFix.newText],
      },
    ]);
  });

  it("matches lines the way the server does, ignoring indentation", () => {
    expect(containsLines("a\r\n    b\n\n c", "b\nc")).toBe(true);
    expect(containsLines("a\nb\nc", "a\nc")).toBe(false);
  });

  // 2026-09-28: asked "Is the GUID fix applied?", Qwen3-Coder read the file,
  // saw the old GUID code and answered "properly applied"
  it("says a failed change is still not in the file", async () => {
    const files = await readFailedEditFiles(withFix, async () => now);
    expect(isApplied(failedEdits(withFix)[0]!, files)).toBe(false);
    expect(ledgerEntries(withFix, WORKSPACE, files)[0]).toContain(
      "Checked just now: the file still does not have the new text, so this change is NOT in the file"
    );
  });

  it("says when a later call made the change after all", async () => {
    const files = await readFailedEditFiles(
      withFix,
      async () => `${now}\n# --- 2. Enum interfaces ---\n  $list = 1`
    );
    expect(ledgerEntries(withFix, WORKSPACE, files)[0]).toContain(
      "FAILED at first (Could not find exact match for edit:)"
    );
    expect(ledgerEntries(withFix, WORKSPACE, files)[0]).toContain(
      "but the file now has its new text"
    );
  });

  it("says nothing about the file when it could not be read", async () => {
    const files = await readFailedEditFiles(withFix, async () => null);
    expect(ledgerEntries(withFix, WORKSPACE, files)[0]).not.toContain(
      "Checked"
    );
  });

  describe("recordNoteFor", () => {
    const files = new Map([["set-radio.ps1", now]]);

    it("notes a reply that calls the missing change applied", () => {
      const note = recordNoteFor(
        "I can confirm that **the GUID fix has been properly applied** to `set-radio.ps1`.",
        withFix,
        files
      );
      expect(note).toBe(
        `SHIELD's record: This edit failed, and the file still does not have the change, whatever the reply says.\n- set-radio.ps1: replacing "${guid.oldText.split("\n")[0]!.slice(0, 57)}..."`
      );
    });

    it("says nothing when the reply names no such file or claims nothing", () => {
      expect(recordNoteFor("The GUID fix is applied.", withFix, files)).toBe(
        ""
      );
      expect(
        recordNoteFor(
          "set-radio.ps1 still has the old GUID code.",
          withFix,
          files
        )
      ).toBe("");
    });

    it("says nothing once the change is in the file", () => {
      const fixed = new Map([["set-radio.ps1", `${now}\n${guidFix.newText}`]]);
      expect(recordNoteFor("Fixed set-radio.ps1.", withFix, fixed)).toBe("");
    });
  });
});

describe("modelWrittenFiles", () => {
  it("lists what the model wrote or edited, not what failed or repeated", () => {
    expect(modelWrittenFiles(session)).toEqual([
      "set-radio.ps1",
      `${WORKSPACE}\\FIXES.md`,
    ]);
  });
});
