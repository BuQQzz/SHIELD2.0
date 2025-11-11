import { DatabaseWrapper, initializeDatabase } from "./DatabaseWrapper";

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

/**
 * Storage layer for web cache
 * Handles database initialization, CRUD operations, and cleanup
 */
export class WebCacheStorage {
  private db: DatabaseWrapper | null = null;

  /**
   * Initialize the cache database
   */
  async initialize(): Promise<DatabaseWrapper> {
    this.db = await initializeDatabase("web-cache.db");
    await this.createTables();
    console.log("[WebCache] Storage initialized");
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
   * Store encrypted content in database
   */
  async set(
    url: string,
    encrypted: Buffer,
    cachedAt: Date,
    expiresAt: Date,
    size: number
  ): Promise<void> {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    await this.db.run(
      `INSERT OR REPLACE INTO cache (url, content, cachedAt, expiresAt, size)
       VALUES (?, ?, ?, ?, ?)`,
      url,
      encrypted,
      cachedAt.toISOString(),
      expiresAt.toISOString(),
      size
    );

    console.log(`[WebCache] Cached: ${url} (${this.formatSize(size)})`);
  }

  /**
   * Retrieve encrypted content from database
   */
  async get(
    url: string
  ): Promise<{ content: Buffer; cachedAt: string; expiresAt: string } | null> {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    const row = await this.db.get<{
      content: Buffer;
      cachedAt: string;
      expiresAt: string;
    }>(
      `SELECT content, cachedAt, expiresAt
       FROM cache
       WHERE url = ? AND expiresAt > ?`,
      url,
      new Date().toISOString()
    );

    return row || null;
  }

  /**
   * Check if URL is cached and not expired
   */
  async has(url: string): Promise<boolean> {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    const result = await this.db.get(
      `SELECT 1 FROM cache WHERE url = ? AND expiresAt > ?`,
      url,
      new Date().toISOString()
    );

    return !!result;
  }

  /**
   * Delete a specific cache entry
   */
  async delete(url: string): Promise<void> {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    await this.db.run(`DELETE FROM cache WHERE url = ?`, url);
    console.log(`[WebCache] Deleted: ${url}`);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    await this.db.run(`DELETE FROM cache`);
    await this.db.run(`VACUUM`);
    console.log("[WebCache] Cache cleared");
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    const beforeCount = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM cache`
    );

    await this.db.run(
      `DELETE FROM cache WHERE expiresAt <= ?`,
      new Date().toISOString()
    );

    const afterCount = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM cache`
    );

    const deletedCount = (beforeCount?.count || 0) - (afterCount?.count || 0);

    if (deletedCount > 0) {
      await this.db.run(`VACUUM`);
      console.log(`[WebCache] Cleared ${deletedCount} expired entries`);
    }

    return deletedCount;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    const stats = await this.db.get<{
      totalEntries: number;
      totalSize: number;
      oldestEntry?: string;
      newestEntry?: string;
    }>(
      `SELECT
         COUNT(*) as totalEntries,
         SUM(size) as totalSize,
         MIN(cachedAt) as oldestEntry,
         MAX(cachedAt) as newestEntry
       FROM cache
       WHERE expiresAt > ?`,
      new Date().toISOString()
    );

    return {
      totalEntries: stats?.totalEntries || 0,
      totalSize: stats?.totalSize || 0,
      oldestEntry: stats?.oldestEntry ? new Date(stats.oldestEntry) : undefined,
      newestEntry: stats?.newestEntry ? new Date(stats.newestEntry) : undefined,
    };
  }

  /**
   * Export all cache entries
   */
  async exportAll(): Promise<
    Array<{
      url: string;
      content: Buffer;
      cachedAt: string;
      expiresAt: string;
      size: number;
    }>
  > {
    if (!this.db) {
      throw new Error("Storage not initialized");
    }

    return await this.db.all<{
      url: string;
      content: Buffer;
      cachedAt: string;
      expiresAt: string;
      size: number;
    }>(
      `SELECT url, content, cachedAt, expiresAt, size
       FROM cache
       WHERE expiresAt > ?
       ORDER BY cachedAt DESC`,
      new Date().toISOString()
    );
  }

  /**
   * Enforce cache size limit by deleting oldest entries
   */
  async enforceSizeLimit(
    maxSizeBytes: number,
    newEntrySize: number
  ): Promise<void> {
    if (!this.db) return;

    const stats = await this.getStats();

    if (stats.totalSize + newEntrySize <= maxSizeBytes) {
      return;
    }

    let deletedCount = 0;
    const mutableStats = { ...stats };

    while (
      mutableStats.totalSize + newEntrySize > maxSizeBytes &&
      deletedCount < 100
    ) {
      await this.db.run(`
        DELETE FROM cache
        WHERE url IN (
          SELECT url FROM cache
          ORDER BY cachedAt ASC
          LIMIT 10
        )
      `);
      deletedCount += 10;

      const newStats = await this.getStats();
      if (newStats.totalSize <= mutableStats.totalSize) break;
      Object.assign(mutableStats, newStats);
    }

    if (deletedCount > 0) {
      await this.db.run(`VACUUM`);
      console.log(`[WebCache] Evicted ${deletedCount} entries to free space`);
    }
  }

  /**
   * Format size in human-readable format
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log("[WebCache] Storage closed");
    }
  }
}
