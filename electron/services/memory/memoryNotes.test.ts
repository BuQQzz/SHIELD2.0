import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryNotesStore } from "./memoryNotesStore";
import { folderScope } from "../../../src/config/memoryNotes";

const spend = folderScope("/p/spend");
let clock = Date.parse("2026-11-14T10:00:00Z");
let store: MemoryNotesStore;

beforeEach(() => {
  clock = Date.parse("2026-11-14T10:00:00Z");
  store = new MemoryNotesStore(":memory:", () => new Date((clock += 1000)));
});

afterEach(async () => {
  await store.close();
});

describe("memory notes store", () => {
  it("saves a note with its anchors, and sees it from its scope only", async () => {
    const added = await store.add({
      scope: spend,
      kind: "howto",
      text: "Run `python3 spend.py summary` for the monthly view",
      source: "conv-1",
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.note.anchors).toEqual(["python3 spend.py summary"]);
    expect((await store.forScope(spend)).map((n) => n.text)).toEqual([
      "Run `python3 spend.py summary` for the monthly view",
    ]);
    expect(await store.forScope(folderScope("/p/other"))).toEqual([]);
    expect(await store.forScope("user")).toEqual([]);
  });

  it("confirms the same note instead of adding it twice", async () => {
    const first = await store.add({
      scope: "user",
      kind: "preference",
      text: "Prefers short answers",
    });
    const again = await store.add({
      scope: "user",
      kind: "preference",
      text: "prefers  SHORT answers",
    });
    expect(first.ok && again.ok && again.note.id === first.note.id).toBe(true);
    expect(await store.list()).toHaveLength(1);
    if (first.ok && again.ok) {
      expect(again.note.confirmedAt > first.note.confirmedAt).toBe(true);
    }
  });

  it("refuses secrets and unknown kinds", async () => {
    expect(
      (
        await store.add({
          scope: "user",
          kind: "fact",
          text: "password: hunter2hunter2",
        })
      ).ok
    ).toBe(false);
    expect(
      (await store.add({ scope: "user", kind: "nope" as never, text: "x" })).ok
    ).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it("replacing a note puts the old one in the trash, and it can come back", async () => {
    const old = await store.add({
      scope: spend,
      kind: "howto",
      text: "Tests run with `npm test`",
    });
    if (!old.ok) throw new Error("not saved");
    const newer = await store.add({
      scope: spend,
      kind: "howto",
      text: "Tests run with `npx vitest run`",
      replaces: old.note.id,
    });
    expect(newer.ok && newer.note.replaces).toBe(old.note.id);
    expect((await store.forScope(spend)).map((n) => n.text)).toEqual([
      "Tests run with `npx vitest run`",
    ]);
    expect(await store.restore(old.note.id)).toBe(true);
    expect(await store.forScope(spend)).toHaveLength(2);
  });

  it("trash, restore and empty trash", async () => {
    const a = await store.add({
      scope: "user",
      kind: "fact",
      text: "Has an RTX 2070 SUPER",
    });
    if (!a.ok) throw new Error("not saved");
    expect(await store.trash(a.note.id)).toBe(true);
    expect(await store.trash(a.note.id)).toBe(false);
    expect(await store.forScope("user")).toEqual([]);
    expect((await store.list())[0]!.status).toBe("trashed");
    expect(await store.search("RTX", "user")).toEqual([]);
    expect(await store.restore(a.note.id)).toBe(true);
    expect(await store.forScope("user")).toHaveLength(1);
    await store.trash(a.note.id);
    expect(await store.emptyTrash()).toBe(1);
    expect(await store.list()).toEqual([]);
  });

  it("edits, marks stale and keeps", async () => {
    const a = await store.add({
      scope: spend,
      kind: "fact",
      text: "Data is kept in ledger.json",
    });
    if (!a.ok) throw new Error("not saved");
    expect(await store.setStatus(a.note.id, "stale")).toBe(true);
    expect((await store.forScope(spend))[0]!.status).toBe("stale");
    const edited = await store.edit(a.note.id, {
      text: "Data lives in users/<name>/expenses.csv",
    });
    expect(edited.ok && edited.note.status).toBe("active");
    expect(edited.ok && edited.note.anchors).toEqual([
      "users/<name>/expenses.csv",
    ]);
    expect((await store.search("expenses", spend)).map((n) => n.id)).toEqual([
      a.note.id,
    ]);
    expect(await store.search("ledger", spend)).toEqual([]);
  });

  it("searches the user's and this folder's notes", async () => {
    await store.add({
      scope: spend,
      kind: "howto",
      text: "Budgets are set with `spend.py budget set`",
    });
    await store.add({
      scope: folderScope("/p/other"),
      kind: "fact",
      text: "Budgets live elsewhere",
    });
    await store.add({
      scope: "user",
      kind: "preference",
      text: "Likes monthly budgets",
    });
    const found = await store.search("budget", spend);
    expect(found.map((n) => n.text).sort()).toEqual([
      "Budgets are set with `spend.py budget set`",
      "Likes monthly budgets",
    ]);
  });

  it("records when notes were used", async () => {
    const a = await store.add({
      scope: "user",
      kind: "fact",
      text: "Uses Linux",
    });
    if (!a.ok) throw new Error("not saved");
    await store.markUsed([a.note.id]);
    expect((await store.forScope("user"))[0]!.usedAt).toBeDefined();
  });
});

describe("the remember tool", () => {
  const textOf = (r: { data?: unknown }) =>
    (r.data as { content: { text: string }[] }).content[0]!.text;

  it("saves a project note in a code session and finds it with search_memory", async () => {
    const { MemoryIndex } = await import("./memoryIndex");
    const { runMemoryTool } = await import("./memoryTools");
    const index = new MemoryIndex(":memory:");
    const access = { store, scope: spend };
    const saved = await runMemoryTool(
      "remember",
      {
        note: "Budgets are set with `spend.py budget set`",
        about: "project",
        kind: "howto",
      },
      index,
      access
    );
    expect(saved.success).toBe(true);
    expect(textOf(saved)).toContain("Saved to memory (this project)");
    const notes = await store.forScope(spend);
    expect(notes.map((n) => [n.scope, n.kind])).toEqual([[spend, "howto"]]);
    const found = await runMemoryTool(
      "search_memory",
      { query: "budget" },
      index,
      access
    );
    expect(textOf(found)).toContain("Memory notes");
    expect(textOf(found)).toContain("spend.py budget set");
  });

  it("keeps user notes for the user, and needs a folder for project notes", async () => {
    const { MemoryIndex } = await import("./memoryIndex");
    const { runMemoryTool } = await import("./memoryTools");
    const index = new MemoryIndex(":memory:");
    const chat = { store, scope: "user" as const };
    const project = await runMemoryTool(
      "remember",
      { note: "Uses pytest", about: "project" },
      index,
      chat
    );
    expect(project.success).toBe(false);
    const user = await runMemoryTool(
      "remember",
      { note: "Prefers short answers", about: "user" },
      index,
      chat
    );
    expect(user.success).toBe(true);
    expect((await store.forScope("user"))[0]!.kind).toBe("preference");
    const secret = await runMemoryTool(
      "remember",
      { note: "token: abcdef123456", about: "user" },
      index,
      chat
    );
    expect(secret.success).toBe(false);
  });
});

describe("what a summary note does to memory", () => {
  it("marks outdated notes and saves Facts and Decisions, merged", async () => {
    const { noteFromSummary } = await import("../../ipc/memoryHandlers");
    const a = await store.add({
      scope: spend,
      kind: "fact",
      text: "Data is in data.csv",
    });
    const b = await store.add({
      scope: spend,
      kind: "howto",
      text: "Run `python3 spend.py summary` for the monthly view",
    });
    if (!a.ok || !b.ok) throw new Error("not saved");
    const checked = [a.note, b.note].map(({ id, text }) => ({ id, text }));
    const result = await noteFromSummary(
      store,
      spend,
      "State: done\nFacts: run `python3 spend.py summary` for the monthly view; data is in users/<name>/expenses.csv\nOutdated: 1",
      checked
    );
    expect(result.stale).toBe(1);
    expect(result.saved).toEqual([
      "replaced: data is in users/<name>/expenses.csv",
    ]);
    // The outdated note is replaced by the newer fact: it goes to the trash
    const notes = await store.forScope(spend);
    expect(notes.map((n) => n.text).sort()).toEqual([
      "Run `python3 spend.py summary` for the monthly view",
      "data is in users/<name>/expenses.csv",
    ]);
    expect((await store.list()).find((n) => n.id === a.note.id)!.status).toBe(
      "trashed"
    );
  });

  it("saves nothing from a chat", async () => {
    const { noteFromSummary } = await import("../../ipc/memoryHandlers");
    expect(
      await noteFromSummary(store, "user", "Facts: the user lives in NY", [])
    ).toEqual({ stale: 0, saved: [] });
    expect(await store.list()).toEqual([]);
  });
});

describe("notes naming files the project no longer has", () => {
  it("are marked possibly out of date; others are left alone", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const { flagMissingFiles } = await import("../../ipc/memoryHandlers");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shield-notes-"));
    try {
      fs.writeFileSync(path.join(dir, "spend.py"), "");
      fs.mkdirSync(path.join(dir, "users", "sam"), { recursive: true });
      fs.writeFileSync(path.join(dir, "users", "sam", "expenses.csv"), "");
      const scope = folderScope(dir);
      const keep = await store.add({
        scope,
        kind: "howto",
        text: "Run `python3 spend.py summary`",
      });
      const placeholder = await store.add({
        scope,
        kind: "fact",
        text: "Data is in users/<name>/expenses.csv",
      });
      const gone = await store.add({
        scope,
        kind: "fact",
        text: "Budgets are read from budgets.json",
      });
      const plain = await store.add({
        scope,
        kind: "decision",
        text: "Amounts are kept in cents",
      });
      expect(await flagMissingFiles(store, dir)).toBe(1);
      const status = Object.fromEntries(
        (await store.forScope(scope)).map((n) => [n.text, n.status])
      );
      expect(status).toEqual({
        [keep.ok ? keep.note.text : ""]: "active",
        [placeholder.ok ? placeholder.note.text : ""]: "active",
        [gone.ok ? gone.note.text : ""]: "stale",
        [plain.ok ? plain.note.text : ""]: "active",
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
