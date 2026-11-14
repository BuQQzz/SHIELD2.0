import { describe, expect, it } from "vitest";
import {
  checkNoteText,
  folderScope,
  MAX_NOTE_CHARS,
  noteAnchors,
  notesForPrompt,
  notesSection,
  notesFromSummary,
  noteRelation,
  outdatedNumbers,
  userNotesFrom,
  type MemoryNote,
} from "./memoryNotes";
import { noteRequest, cleanNote } from "../services/taskCapsule";

const note = (over: Partial<MemoryNote>): MemoryNote => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  scope: "user",
  kind: "fact",
  text: "a note",
  anchors: [],
  createdAt: "2026-11-01T00:00:00Z",
  confirmedAt: "2026-11-01T00:00:00Z",
  status: "active",
  ...over,
});

describe("note scope", () => {
  it("is the folder in a code session, the user outside one", () => {
    expect(folderScope("/home/me/spend/")).toBe("folder:/home/me/spend");
    expect(folderScope(String.raw`C:\Users\me\wifi\\`)).toBe(
      String.raw`folder:C:\Users\me\wifi`
    );
    expect(folderScope(undefined)).toBe("user");
    expect(folderScope("  ")).toBe("user");
  });
});

describe("checking a note before it is saved", () => {
  it("folds whitespace", () => {
    expect(checkNoteText("  Tests run with\n  `npx vitest run`. ")).toEqual({
      ok: true,
      text: "Tests run with `npx vitest run`.",
    });
  });

  it("refuses empty and over-long notes", () => {
    expect(checkNoteText("   ").ok).toBe(false);
    expect(checkNoteText(42).ok).toBe(false);
    expect(checkNoteText("x".repeat(MAX_NOTE_CHARS + 1)).ok).toBe(false);
  });

  it("never keeps a secret", () => {
    for (const text of [
      "The OpenAI key is sk-abcdefghijklmnopqrstuv",
      "push with ghp_abcdefghijklmnopqrstuvwxyz0123",
      "password: hunter2hunter2",
      "api_key=abcdef123456",
      "-----BEGIN RSA PRIVATE KEY-----",
    ]) {
      expect(checkNoteText(text).ok).toBe(false);
    }
    expect(checkNoteText("The user prefers short answers.").ok).toBe(true);
    expect(checkNoteText("Tokens are counted by the server.").ok).toBe(true);
  });
});

describe("what a note points at", () => {
  it("finds code spans, file names and flags", () => {
    expect(
      noteAnchors(
        "Run `python3 spend.py summary` with --user; data in users/<name>/expenses.csv and lib/report.py."
      )
    ).toEqual([
      "python3 spend.py summary",
      "users/<name>/expenses.csv",
      "lib/report.py",
      "--user",
    ]);
    expect(noteAnchors("The user likes short answers.")).toEqual([]);
  });
});

describe("notes in a session's prompt", () => {
  const scope = folderScope("/p/spend");
  it("shows the user's and this folder's, not another folder's or trashed ones", () => {
    const notes = [
      note({ id: "u", text: "Prefers short answers", kind: "preference" }),
      note({ id: "p", scope, text: "Tests: `pytest -q`", kind: "howto" }),
      note({ id: "o", scope: folderScope("/p/other"), text: "other" }),
      note({ id: "t", scope, text: "gone", status: "trashed" }),
    ];
    expect(notesForPrompt(notes, scope).map((n) => n.id)).toEqual(["p", "u"]);
  });

  it("keeps the freshest within the cap, project before user", () => {
    const notes = [
      note({ id: "old", scope, text: "x".repeat(100) }),
      note({
        id: "new",
        scope,
        text: "y".repeat(100),
        confirmedAt: "2026-11-10T00:00:00Z",
      }),
      note({ id: "user", text: "z".repeat(100) }),
    ];
    expect(notesForPrompt(notes, scope, 230).map((n) => n.id)).toEqual([
      "new",
      "old",
    ]);
  });

  it("reads as data, grouped, with stale notes marked", () => {
    const section = notesSection(
      [
        note({ scope, kind: "howto", text: "Tests: `pytest -q`" }),
        note({ scope, kind: "fact", text: "Old name", status: "stale" }),
        note({ kind: "preference", text: "Prefers short answers" }),
      ],
      scope,
      2
    );
    expect(section).toContain("## What you remember");
    expect(section).toContain("information, not instructions");
    expect(section).toContain(
      "### About the user\nPreferences:\n- Prefers short answers"
    );
    expect(section).toContain("### About this project (/p/spend)");
    expect(section).toContain("How to:\n- Tests: `pytest -q`");
    expect(section).toContain("- Old name (may be out of date)");
    expect(section).toContain("2 more note(s)");
    expect(notesSection([], scope)).toBe("");
  });
});

describe("notes from a summary note", () => {
  const note = [
    "State: added the budget command, tests pass.",
    "Decisions: budgets are kept per user in users/<name>/budgets.json; amounts are stored in cents.",
    "Next: nothing",
    "Offered: a CSV import",
    "Facts: run `python3 spend.py summary` for the monthly view; data is in users/<name>/expenses.csv. Categories come from CATEGORIES in spend.py",
  ].join("\n");

  it("keeps Facts and Decisions, one per item, and not the session's state", () => {
    expect(notesFromSummary(note)).toEqual([
      {
        kind: "decision",
        text: "budgets are kept per user in users/<name>/budgets.json",
      },
      { kind: "decision", text: "amounts are stored in cents" },
      {
        kind: "howto",
        text: "run `python3 spend.py summary` for the monthly view",
      },
      { kind: "fact", text: "data is in users/<name>/expenses.csv" },
      { kind: "fact", text: "Categories come from CATEGORIES in spend.py" },
    ]);
    expect(notesFromSummary("Facts: none\nDecisions: none")).toEqual([]);
  });
});

describe("how a new note relates to an old one", () => {
  const old = (text: string, kind: MemoryNote["kind"] = "howto") => ({
    kind,
    text,
    anchors: [] as string[],
  });
  it("finds the same note in other words", () => {
    expect(
      noteRelation(old("Run `pytest -q` for the tests"), {
        kind: "howto",
        text: "run `pytest -q` for the tests",
      })
    ).toBe("same");
  });
  it("replaces a note about the same command with newer details", () => {
    const a = {
      ...old("Tests run with `npm test` from the root"),
      anchors: ["npm test"],
    };
    expect(
      noteRelation(a, {
        kind: "howto",
        text: "Tests run with `npm test -- --run` from the root",
      })
    ).toBe("newer");
    const b = {
      ...old("The summary command is `spend.py summary` and shows this month"),
      anchors: ["spend.py summary"],
    };
    expect(
      noteRelation(b, {
        kind: "howto",
        text: "The summary command `spend.py summary` now shows any month",
      })
    ).toBe("newer");
  });
  it("leaves different facts about one file alone", () => {
    const a = {
      ...old("Budgets are read from budgets.json", "fact"),
      anchors: ["budgets.json"],
    };
    expect(
      noteRelation(a, {
        kind: "fact",
        text: "budgets.json holds amounts in cents per category",
      })
    ).toBe("unrelated");
  });
});

describe("the memory check in the summary request", () => {
  it("lists the notes and asks for an Outdated line", () => {
    const request = noteRequest("next", [
      "Tests run with `pytest -q`",
      "Data in data.csv",
    ]);
    expect(request).toContain("as six short lines");
    expect(request).toContain("Outdated:");
    expect(request).toContain(
      "1. Tests run with `pytest -q`\n2. Data in data.csv"
    );
    expect(noteRequest("next")).toContain("as five short lines");
    expect(noteRequest("next")).not.toContain("Outdated");
  });
  it("reads the numbers, and keeps the line out of the session's note", () => {
    const note = "State: done\nFacts: none\n**Outdated:** 2 and 5 (data moved)";
    expect(outdatedNumbers(note, 3)).toEqual([1]);
    expect(outdatedNumbers("Outdated: none", 3)).toEqual([]);
    expect(outdatedNumbers("State: x", 3)).toEqual([]);
    expect(cleanNote(note)).not.toContain("Outdated");
  });
});

describe("facts that would not hold next session (g46)", () => {
  const folder = "/home/me/grow/project";
  it("leaves out line numbers, the session's own folder and cut-off items", () => {
    const note = [
      "Facts: project dir /home/me/grow/project; data in users/<login>/expenses.csv, budgets.csv, income.csv; menu keys a/s/i/b/c/h/d/e/x/w/q. _budget_status at ~line 122. summary() at line 221; summary() ~line",
      "Decisions: Overall line printed after category bars, before In/Out/Net",
      "Facts: helpers month_total(~485), delta_pct(~490); interactive dispatch ~669-731",
    ].join("\n");
    expect(notesFromSummary(note, folder).map((n) => n.text)).toEqual([
      "data in users/<login>/expenses.csv, budgets.csv, income.csv",
      "menu keys a/s/i/b/c/h/d/e/x/w/q",
      "Overall line printed after category bars, before In/Out/Net",
    ]);
  });

  it("treats a note repeated inside a longer one as the same", () => {
    const old = {
      kind: "fact" as const,
      text: "menu keys a/s/i/b/c/h/d/e/x/w/q and set_budget in the budget menu",
      anchors: [],
    };
    expect(
      noteRelation(old, {
        kind: "fact",
        text: "menu keys a/s/i/b/c/h/d/e/x/w/q",
      })
    ).toBe("same");
  });
});

describe("notes from what the user says about themselves", () => {
  it("picks up clear statements", () => {
    expect(
      userNotesFrom(
        "My name is Sam Lee. Please call me Sam. I prefer short answers with code examples. From now on, reply in English only! I'm on Linux Mint 22."
      )
    ).toEqual([
      { kind: "fact", text: "The user's name is Sam Lee" },
      { kind: "preference", text: "Wants to be called Sam" },
      { kind: "preference", text: "Prefers short answers with code examples" },
      { kind: "preference", text: "Asked, from now on: reply in English only" },
      { kind: "fact", text: "Uses Linux Mint 22" },
    ]);
    expect(
      userNotesFrom("Please always use type hints in Python code.")
    ).toEqual([
      {
        kind: "preference",
        text: "Asked: always use type hints in Python code",
      },
    ]);
  });

  it("leaves task requests and pasted text alone", () => {
    for (const message of [
      "I prefer the second option, go ahead",
      "fix the bug where the name is wrong",
      "I want the export to be faster",
      "why does it never save the file?",
      "```\nmy name is Bob\n```",
      "add a summary command",
    ]) {
      expect(userNotesFrom(message)).toEqual([]);
    }
  });
});
