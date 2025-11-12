import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3");

import { app } from "electron";
import path from "path";
import fs from "fs";

// Type definitions for sqlite3
type Database = unknown;
type SqliteError = Error | null;

/**
 * Promisified database wrapper for sqlite3
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
 * Handles database operations for web cache storage
 */
export class WebCacheStorage {
  private db: DatabaseWrapper | null = null;

  /**
   * Initialize the cache database
   */
  async initialize(): Promise<DatabaseWrapper> {
    if (this.db) return this.db;

    const userDataPath = app.getPath("userData");
    const dbPath = path.join(userDataPath, "web-cache.db");

    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    // Open database with Node-API
    const rawDb = new sqlite3.Database(dbPath);
    this.db = new DatabaseWrapper(rawDb);

    // Enable WAL mode for better concurrency
    await this.db.exec("PRAGMA journal_mode = WAL");

    // Create tables
    await this.createTables();

    console.log("[WebCache] Cache initialized at:", dbPath);
    return this.db;
  }

  /**
   * Get database instance
   */
  getDatabase(): DatabaseWrapper {
    if (!this.db) {
      throw new Error("Database not initialized");
    }
    return this.db;
  }

  /**
   * Create database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) return;

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        url TEXT PRIMARY KEY,
        content BLOB NOT NULL,
        cachedAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        size INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_expiresAt ON cache(expiresAt);
      CREATE INDEX IF NOT EXISTS idx_cachedAt ON cache(cachedAt);
    `);
  }

  /**
   * Cleanup database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log("[WebCache] Database closed");
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }
}
