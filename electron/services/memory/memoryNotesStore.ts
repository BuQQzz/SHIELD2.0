/**
 * Where memory notes are kept (src/config/memoryNotes.ts says what they
 * are): SQLite in SHIELD's app data folder, its own file next to the
 * conversation index, so rebuilding the index never touches them. Never in
 * a project folder, so nothing SHIELD remembers lands in a repository.
 *
 * A removed note goes to the memory trash and can be restored; only the
 * user empties it (Settings › Memory).
 */

import { createRequire } from "module";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import {
  checkNoteText,
  isNoteKind,
  type NoteCandidate,
  noteAnchors,
  type MemoryNote,
  type NoteKind,
  type NoteScope,
  type NoteStatus,
} from "../../../src/config/memoryNotes.js";
import { noteRelation } from "../../../src/config/memoryNoteSources.js";
import { ftsQuery, queryTerms } from "./memoryEntries.js";

const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3");

interface Db {
  run(sql: string, params: unknown[], cb: (err: Error | null) => void): void;
  all(
    sql: string,
    params: unknown[],
    cb: (err: Error | null, rows: unknown[]) => void
  ): void;
  close(cb: (err: Error | null) => void): void;
}

const SCHEMA = [
  "PRAGMA journal_mode = WAL",
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    anchors TEXT NOT NULL,
    source TEXT,
    created_at TEXT NOT NULL,
    confirmed_at TEXT NOT NULL,
    used_at TEXT,
    status TEXT NOT NULL,
    replaces TEXT,
    stale_reason TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS notes_scope ON notes (scope, status)",
  `CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    text, note_id UNINDEXED, tokenize = 'porter unicode61'
  )`,
];

interface Row {
  id: string;
  scope: string;
  kind: string;
  text: string;
  anchors: string;
  source: string | null;
  created_at: string;
  confirmed_at: string;
  used_at: string | null;
  status: string;
  replaces: string | null;
  stale_reason: string | null;
}

function toNote(row: Row): MemoryNote {
  return {
    id: row.id,
    scope: row.scope as NoteScope,
    kind: (isNoteKind(row.kind) ? row.kind : "fact") as NoteKind,
    text: row.text,
    anchors: JSON.parse(row.anchors || "[]") as string[],
    ...(row.source ? { source: row.source } : {}),
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    ...(row.used_at ? { usedAt: row.used_at } : {}),
    status: row.status as NoteStatus,
    ...(row.replaces ? { replaces: row.replaces } : {}),
    ...(row.status === "stale" && row.stale_reason
      ? { staleReason: row.stale_reason }
      : {}),
  };
}

export interface NewNote {
  scope: NoteScope;
  kind: NoteKind;
  text: string;
  source?: string;
  replaces?: string;
}

export type NoteResult =
  { ok: true; note: MemoryNote } | { ok: false; reason: string };

export class MemoryNotesStore {
  private db: Db | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dbPath: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  private run(sql: string, params: unknown[] = []): Promise<void> {
    return new Promise((resolve, reject) =>
      this.db!.run(sql, params, (err) => (err ? reject(err) : resolve()))
    );
  }

  private all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) =>
      this.db!.all(sql, params, (err, rows) =>
        err ? reject(err) : resolve((rows ?? []) as T[])
      )
    );
  }

  /** One change at a time, in order, each after the database is open */
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(
      () => this.open().then(work),
      () => this.open().then(work)
    );
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async open(): Promise<void> {
    if (this.db) return;
    if (this.dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    }
    this.db = await new Promise<Db>((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err: Error | null) =>
        err ? reject(err) : resolve(db)
      );
    });
    for (const sql of SCHEMA) await this.run(sql);
    // A notes file made before stale_reason (2026-11-15) gets the column
    await this.run("ALTER TABLE notes ADD COLUMN stale_reason TEXT").catch(
      () => undefined
    );
  }

  async close(): Promise<void> {
    const db = this.db;
    this.db = null;
    if (db) await new Promise<void>((r) => db.close(() => r()));
  }

  private async get(id: string): Promise<MemoryNote | null> {
    const [row] = await this.all<Row>("SELECT * FROM notes WHERE id = ?", [id]);
    return row ? toNote(row) : null;
  }

  /**
   * Save a note. The same text already in the scope is confirmed instead of
   * added twice.
   */
  add(input: NewNote): Promise<NoteResult> {
    return this.serial(async () => {
      if (!isNoteKind(input.kind)) {
        return { ok: false as const, reason: `unknown kind "${input.kind}"` };
      }
      const checked = checkNoteText(input.text);
      if (!checked.ok) return checked;
      const at = this.now().toISOString();
      const [same] = await this.all<Row>(
        "SELECT * FROM notes WHERE scope = ? AND status != 'trashed' AND lower(text) = lower(?)",
        [input.scope, checked.text]
      );
      if (same) {
        await this.run(
          "UPDATE notes SET confirmed_at = ?, status = 'active' WHERE id = ?",
          [at, same.id]
        );
        return { ok: true as const, note: (await this.get(same.id))! };
      }
      const note: MemoryNote = {
        id: crypto.randomUUID(),
        scope: input.scope,
        kind: input.kind,
        text: checked.text,
        anchors: noteAnchors(checked.text),
        ...(input.source ? { source: input.source } : {}),
        createdAt: at,
        confirmedAt: at,
        status: "active",
        ...(input.replaces ? { replaces: input.replaces } : {}),
      };
      await this.run("BEGIN");
      try {
        await this.run(
          `INSERT INTO notes (id, scope, kind, text, anchors, source, created_at, confirmed_at, used_at, status, replaces)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active', ?)`,
          [
            note.id,
            note.scope,
            note.kind,
            note.text,
            JSON.stringify(note.anchors),
            note.source ?? null,
            at,
            at,
            note.replaces ?? null,
          ]
        );
        await this.run("INSERT INTO notes_fts (text, note_id) VALUES (?, ?)", [
          note.text,
          note.id,
        ]);
        if (input.replaces) {
          await this.run(
            "UPDATE notes SET status = 'trashed' WHERE id = ? AND scope = ?",
            [input.replaces, input.scope]
          );
        }
        await this.run("COMMIT");
      } catch (error) {
        await this.run("ROLLBACK").catch(() => undefined);
        throw error;
      }
      return { ok: true as const, note };
    });
  }

  /** Change a note's text or kind; it counts as confirmed */
  edit(
    id: string,
    change: { text?: string; kind?: NoteKind }
  ): Promise<NoteResult> {
    return this.serial(async () => {
      const note = await this.get(id);
      if (!note) return { ok: false as const, reason: "no such note" };
      const kind = change.kind ?? note.kind;
      if (!isNoteKind(kind)) {
        return { ok: false as const, reason: `unknown kind "${kind}"` };
      }
      const checked = checkNoteText(change.text ?? note.text);
      if (!checked.ok) return checked;
      const at = this.now().toISOString();
      await this.run(
        "UPDATE notes SET text = ?, kind = ?, anchors = ?, confirmed_at = ?, status = CASE status WHEN 'trashed' THEN 'trashed' ELSE 'active' END WHERE id = ?",
        [checked.text, kind, JSON.stringify(noteAnchors(checked.text)), at, id]
      );
      await this.run("UPDATE notes_fts SET text = ? WHERE note_id = ?", [
        checked.text,
        id,
      ]);
      return { ok: true as const, note: (await this.get(id))! };
    });
  }

  /**
   * Mark notes as still holding (Keep), or as possibly out of date, with
   * why, for the memory check
   */
  setStatus(
    id: string,
    status: "active" | "stale",
    reason?: string
  ): Promise<boolean> {
    return this.serial(async () => {
      const note = await this.get(id);
      if (!note || note.status === "trashed") return false;
      if (status === "active") {
        await this.run(
          "UPDATE notes SET status = 'active', stale_reason = NULL, confirmed_at = ? WHERE id = ?",
          [this.now().toISOString(), id]
        );
      } else {
        await this.run(
          "UPDATE notes SET status = 'stale', stale_reason = ? WHERE id = ?",
          [reason ?? null, id]
        );
      }
      return true;
    });
  }

  /** Move to the memory trash; restore() brings it back */
  trash(id: string): Promise<boolean> {
    return this.setTrashed(id, true);
  }

  restore(id: string): Promise<boolean> {
    return this.setTrashed(id, false);
  }

  private setTrashed(id: string, trashed: boolean): Promise<boolean> {
    return this.serial(async () => {
      const note = await this.get(id);
      if (!note || (note.status === "trashed") === trashed) return false;
      await this.run("UPDATE notes SET status = ? WHERE id = ?", [
        trashed ? "trashed" : "active",
        id,
      ]);
      return true;
    });
  }

  /** Delete what is in the memory trash for good: the user's action only */
  emptyTrash(): Promise<number> {
    return this.serial(async () => {
      const rows = await this.all<{ id: string }>(
        "SELECT id FROM notes WHERE status = 'trashed'"
      );
      await this.run("BEGIN");
      try {
        await this.run(
          "DELETE FROM notes_fts WHERE note_id IN (SELECT id FROM notes WHERE status = 'trashed')"
        );
        await this.run("DELETE FROM notes WHERE status = 'trashed'");
        await this.run("COMMIT");
      } catch (error) {
        await this.run("ROLLBACK").catch(() => undefined);
        throw error;
      }
      return rows.length;
    });
  }

  /** Every note, trash included, newest first (Settings › Memory) */
  list(): Promise<MemoryNote[]> {
    return this.serial(async () =>
      (
        await this.all<Row>("SELECT * FROM notes ORDER BY confirmed_at DESC")
      ).map(toNote)
    );
  }

  /** The notes a session can see: the user's and its folder's, not trashed */
  forScope(scope: NoteScope): Promise<MemoryNote[]> {
    return this.serial(async () =>
      (
        await this.all<Row>(
          "SELECT * FROM notes WHERE status != 'trashed' AND (scope = 'user' OR scope = ?) ORDER BY confirmed_at DESC",
          [scope]
        )
      ).map(toNote)
    );
  }

  /** Notes matching words of `query`, best first, within what `scope` sees */
  search(query: string, scope: NoteScope, limit = 5): Promise<MemoryNote[]> {
    return this.serial(async () => {
      const match = ftsQuery(queryTerms(query));
      if (!match) return [];
      const rows = await this.all<Row>(
        `SELECT notes.* FROM notes_fts JOIN notes ON notes.id = notes_fts.note_id
         WHERE notes_fts MATCH ? AND notes.status != 'trashed' AND (notes.scope = 'user' OR notes.scope = ?)
         ORDER BY bm25(notes_fts) LIMIT ?`,
        [match, scope, limit]
      );
      return rows.map(toNote);
    });
  }

  /**
   * Save a note SHIELD found on its own (a summary's Facts and Decisions),
   * checked against the scope's notes first (noteRelation): the same note
   * is confirmed, a newer one replaces the old (which goes to the memory
   * trash, where the user can restore it), anything else is added.
   */
  async merge(
    scope: NoteScope,
    candidate: NoteCandidate,
    source?: string
  ): Promise<{
    action: "confirmed" | "replaced" | "added";
    note?: MemoryNote;
  } | null> {
    const existing = (await this.forScope(scope)).filter(
      (note) => note.scope === scope
    );
    let replaces: string | undefined;
    for (const old of existing) {
      const relation = noteRelation(old, candidate);
      if (relation === "same") {
        await this.setStatus(old.id, "active");
        return { action: "confirmed", note: old };
      }
      if (relation === "newer" && !replaces) replaces = old.id;
    }
    const saved = await this.add({ scope, ...candidate, source, replaces });
    if (!saved.ok) return null;
    return { action: replaces ? "replaced" : "added", note: saved.note };
  }

  /** Record that these notes went into a session (ranking, staleness) */
  markUsed(ids: string[]): Promise<void> {
    return this.serial(async () => {
      if (ids.length === 0) return;
      const at = this.now().toISOString();
      await this.run(
        `UPDATE notes SET used_at = ? WHERE id IN (${ids.map(() => "?").join(",")})`,
        [at, ...ids]
      );
    });
  }
}
