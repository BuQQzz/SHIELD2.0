/**
 * Database Wrapper - Promisified SQLite database interface
 */

type Database = unknown;
type SqliteError = Error | null;

/**
 * Wrapper class that provides promisified methods for sqlite3 database operations
 */
export class DatabaseWrapper {
  constructor(private db: Database) {}

  /**
   * Execute a SQL statement
   */
  run(sql: string, ...params: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).run(sql, params, (err: SqliteError) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get a single row from the database
   */
  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).get(sql, params, (err: SqliteError, row: T) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Get all rows from the database
   */
  all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).all(sql, params, (err: SqliteError, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Close the database connection
   */
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
