import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3");

import { app } from "electron";
import path from "path";
import fs from "fs";

type Database = unknown;
type SqliteError = Error | null;

/**
 * Promisified database wrapper for SQLite operations
 * Provides async/await interface for sqlite3 callbacks
 */
export class DatabaseWrapper {
  constructor(private db: Database) {}

  run(sql: string, ...params: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).run(sql, params, (err: SqliteError) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get<T = unknown>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).get(sql, params, (err: SqliteError, row: unknown) => {
        if (err) reject(err);
        else resolve(row as T);
      });
    });
  }

  all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).all(sql, params, (err: SqliteError, rows: unknown) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).exec(sql, (err: SqliteError) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).close((err: SqliteError) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

/**
 * Initialize a SQLite database connection with WAL mode
 */
export async function initializeDatabase(
  filename: string
): Promise<DatabaseWrapper> {
  const userDataPath = app.getPath("userData");
  const dbPath = path.join(userDataPath, filename);

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const rawDb = new sqlite3.Database(dbPath);
  const db = new DatabaseWrapper(rawDb);

  await db.exec("PRAGMA journal_mode = WAL");

  return db;
}
