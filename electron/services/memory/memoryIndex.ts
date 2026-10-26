/**
 * SHIELD's memory index: SQLite full-text search (FTS5, BM25 ranking) over
 * every saved conversation (memoryEntries.ts says what is indexed).
 *
 * Chosen for small machines: SQLite ships with SHIELD already, a search
 * takes milliseconds on the CPU, and nothing is loaded into RAM or the GPU
 * - no embedding model. Meaning-based search can be added on top later for
 * machines with room; words, file names and errors find most of what a
 * user means by "like last time".
 */

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import {
  entriesOf,
  ftsQuery,
  matchedTerms,
  notDoneLines,
  queryTerms,
  RECORD_ID,
  recordLines,
  recordLinesFor,
  type MemoryConversation,
  type MemoryHit,
} from "./memoryEntries.js";

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

/** One indexed message in full, for open_memory */
export interface MemoryRecord {
  id: string;
  conversationId: string;
  messageIndex: number;
  role: MemoryHit["role"];
  tool?: string;
  title: string;
  kind: "chat" | "code";
  folder?: string;
  createdAt: number;
  text: string;
  /** The user's request this reply or result followed */
  request?: string;
  /**
   * SHIELD's record lines about the files this message mentions: what
   * became of the changes it talks about
   */
  record?: string[];
}

export interface SearchOptions {
  limit?: number;
  /** Leave out this conversation (the one being answered) */
  excludeConversation?: string;
  /** Only matches containing at least this many of the search terms */
  minMatched?: number;
  /** ...and at least this share of them (0-1), for long queries */
  minShare?: number;
  /** Most matches taken from one conversation */
  perConversation?: number;
}

interface Row {
  entry_id: string;
  conversation_id: string;
  message_index: number;
  role: MemoryHit["role"];
  tool: string | null;
  title: string;
  kind: "chat" | "code";
  folder: string | null;
  project_id: string | null;
  created_at: number;
  snip: string;
  text: string;
  score: number;
}

const SCHEMA = [
  "PRAGMA journal_mode = WAL",
  `CREATE VIRTUAL TABLE IF NOT EXISTS memory USING fts5(
    text, title,
    entry_id UNINDEXED, conversation_id UNINDEXED, message_index UNINDEXED,
    role UNINDEXED, tool UNINDEXED, kind UNINDEXED, folder UNINDEXED,
    project_id UNINDEXED, created_at UNINDEXED,
    tokenize = 'porter unicode61'
  )`,
  `CREATE TABLE IF NOT EXISTS indexed (
    conversation_id TEXT PRIMARY KEY,
    updated_at INTEGER NOT NULL
  )`,
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

/**
 * What the index holds and how. Raised when that changes (2: each code
 * session's record; 3: memory tools' own results left out; 4: each
 * session's plan), so the index is rebuilt once instead of keeping entries
 * made the old way until their conversation changes.
 */
export const INDEX_VERSION = "4";

export class MemoryIndex {
  private db: Db | null = null;
  /** Writes run one at a time, in order */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly dbPath: string) {}

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

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async open(): Promise<void> {
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
    const [version] = await this.all<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'version'"
    );
    if (version?.value !== INDEX_VERSION) {
      // Everything is indexed again by the next catch-up (syncMemoryIndex)
      await this.run("DELETE FROM memory");
      await this.run("DELETE FROM indexed");
      await this.run(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('version', ?)",
        [INDEX_VERSION]
      );
    }
  }

  /** Replaces what the index holds for a conversation with its messages now */
  indexConversation(conversation: MemoryConversation): Promise<void> {
    return this.serial(async () => {
      await this.open();
      const entries = entriesOf(conversation);
      await this.run("BEGIN");
      try {
        await this.run("DELETE FROM memory WHERE conversation_id = ?", [
          conversation.id,
        ]);
        for (const e of entries) {
          await this.run(
            `INSERT INTO memory (text, title, entry_id, conversation_id, message_index, role, tool, kind, folder, project_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              e.text,
              e.title,
              e.id,
              e.conversationId,
              e.messageIndex,
              e.role,
              e.tool ?? null,
              e.kind,
              e.folder ?? null,
              e.projectId ?? null,
              e.createdAt,
            ]
          );
        }
        await this.run(
          "INSERT OR REPLACE INTO indexed (conversation_id, updated_at) VALUES (?, ?)",
          [conversation.id, new Date(conversation.updatedAt).getTime() || 0]
        );
        await this.run("COMMIT");
      } catch (error) {
        await this.run("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }

  removeConversation(conversationId: string): Promise<void> {
    return this.serial(async () => {
      await this.open();
      await this.run("DELETE FROM memory WHERE conversation_id = ?", [
        conversationId,
      ]);
      await this.run("DELETE FROM indexed WHERE conversation_id = ?", [
        conversationId,
      ]);
    });
  }

  /** When each conversation was last indexed (its updatedAt then) */
  async indexedVersions(): Promise<Map<string, number>> {
    await this.open();
    const rows = await this.all<{
      conversation_id: string;
      updated_at: number;
    }>("SELECT conversation_id, updated_at FROM indexed");
    return new Map(rows.map((r) => [r.conversation_id, r.updated_at]));
  }

  /** The best matches for the words in `query`, a few per conversation */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<MemoryHit[]> {
    const { limit = 5, excludeConversation, minMatched = 1 } = options;
    const perConversation = options.perConversation ?? 2;
    const terms = queryTerms(query);
    if (terms.length === 0) return [];
    const needed = Math.max(
      minMatched,
      Math.ceil(terms.length * (options.minShare ?? 0))
    );
    await this.open();
    const rows = await this.all<Row>(
      `SELECT entry_id, conversation_id, message_index, role, tool, title, kind, folder, project_id, created_at,
              snippet(memory, 0, '', '', '…', 20) AS snip, text, bm25(memory, 1.0, 0.4) AS score
       FROM memory WHERE memory MATCH ? ${excludeConversation ? "AND conversation_id != ?" : ""}
       ORDER BY score LIMIT ?`,
      [
        ftsQuery(terms),
        ...(excludeConversation ? [excludeConversation] : []),
        limit * 6,
      ]
    );
    const perConv = new Map<string, number>();
    const hits: MemoryHit[] = [];
    for (const row of rows) {
      const matched = matchedTerms(`${row.text} ${row.title}`, terms);
      if (matched < needed) continue;
      const count = perConv.get(row.conversation_id) ?? 0;
      if (count >= perConversation) continue;
      perConv.set(row.conversation_id, count + 1);
      hits.push({
        id: row.entry_id,
        conversationId: row.conversation_id,
        messageIndex: Number(row.message_index),
        role: row.role,
        tool: row.tool ?? undefined,
        title: row.title,
        kind: row.kind,
        folder: row.folder ?? undefined,
        projectId: row.project_id ?? undefined,
        createdAt: Number(row.created_at),
        snippet: row.snip,
        score: row.score,
        matched,
      });
      if (hits.length === limit) break;
    }
    return hits;
  }

  /**
   * One entry in full, with the user's request it followed (when it is not
   * the request itself), or null when there is no such id
   */
  async read(id: string): Promise<MemoryRecord | null> {
    await this.open();
    const [row] = await this.all<Row>(
      `SELECT entry_id, conversation_id, message_index, role, tool, title, kind, folder, project_id, created_at,
              '' AS snip, text, 0 AS score
       FROM memory WHERE entry_id = ?`,
      [id]
    );
    if (!row) return null;
    const record: MemoryRecord = {
      id: row.entry_id,
      conversationId: row.conversation_id,
      messageIndex: Number(row.message_index),
      role: row.role,
      tool: row.tool ?? undefined,
      title: row.title,
      kind: row.kind,
      folder: row.folder ?? undefined,
      createdAt: Number(row.created_at),
      text: row.text,
    };
    if (row.role === "record" || row.role === "plan") return record;
    const lines = await this.recordOf(row.conversation_id);
    const relevant = recordLinesFor(lines, row.text);
    if (relevant.length) record.record = relevant;
    if (row.role === "user") return record;
    const requests = await this.all<{ text: string; message_index: number }>(
      "SELECT text, message_index FROM memory WHERE conversation_id = ? AND role = 'user'",
      [row.conversation_id]
    );
    const before = requests
      .filter((r) => Number(r.message_index) < record.messageIndex)
      .sort((a, b) => Number(b.message_index) - Number(a.message_index))[0];
    return { ...record, request: before?.text };
  }

  /** A conversation's record lines, or none */
  async recordOf(conversationId: string): Promise<string[]> {
    await this.open();
    const [row] = await this.all<{ text: string }>(
      "SELECT text FROM memory WHERE entry_id = ?",
      [`${conversationId}${RECORD_ID}`]
    );
    return row ? recordLines(row.text) : [];
  }

  /** For each conversation, the changes its record shows were not made */
  async notDoneFor(conversationIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    for (const id of new Set(conversationIds)) {
      const items = notDoneLines(await this.recordOf(id));
      if (items.length) result.set(id, items);
    }
    return result;
  }

  close(): Promise<void> {
    const db = this.db;
    this.db = null;
    if (!db) return Promise.resolve();
    return new Promise((resolve) => db.close(() => resolve()));
  }
}
