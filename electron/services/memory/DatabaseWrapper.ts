/**
 * Database Wrapper - Promise-based SQLite interface
 */

type Database = unknown;
type SqliteError = Error | null;

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

  get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).get(sql, params, (err: SqliteError, row: T) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.db as any).all(sql, params, (err: SqliteError, rows: T[]) => {
        if (err) reject(err);
        else resolve(rows || []);
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
