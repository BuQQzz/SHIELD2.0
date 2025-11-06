import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3");

// Type definitions for sqlite3
type Database = unknown;
type SqliteError = Error | null;

/**
 * Promisified wrapper for SQLite database operations
 * Converts callback-based sqlite3 API to Promise-based interface
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
 * Create a new SQLite database connection
 */
export function createDatabase(dbPath: string): DatabaseWrapper {
  const rawDb = new sqlite3.Database(dbPath);
  return new DatabaseWrapper(rawDb);
}
