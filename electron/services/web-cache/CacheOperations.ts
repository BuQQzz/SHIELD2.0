import type { PageContent } from "../WebSearchService";
import type { DatabaseWrapper } from "./WebCacheStorage";
import type { WebCacheEncryption } from "./WebCacheEncryption";

export interface CacheEntry {
  url: string;
  content: PageContent;
  cachedAt: Date;
  expiresAt: Date;
  size: number;
  encrypted: boolean;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

/**
 * Handles cache CRUD operations and queries
 */
export class CacheOperations {
  constructor(
    private db: DatabaseWrapper,
    private encryption: WebCacheEncryption
  ) {}

  /**
   * Store encrypted content in cache
   */
  async set(
    url: string,
    content: PageContent,
    expiresAt: Date,
    size: number
  ): Promise<void> {
    const now = new Date();
    const serialized = JSON.stringify(content);
    const encrypted = this.encryption.encrypt(serialized);

    await this.db.run(
      `INSERT OR REPLACE INTO cache (url, content, cachedAt, expiresAt, size)
       VALUES (?, ?, ?, ?, ?)`,
      url,
      encrypted,
      now.toISOString(),
      expiresAt.toISOString(),
      size
    );

    console.log(`[WebCache] Cached: ${url} (${this.formatSize(size)})`);
  }

  /**
   * Retrieve and decrypt content from cache
   */
  async get(url: string): Promise<PageContent | null> {
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

    if (!row) {
      console.log(`[WebCache] Cache miss: ${url}`);
      return null;
    }

    try {
      const decrypted = this.encryption.decrypt(row.content);
      const content = JSON.parse(decrypted) as PageContent;
      console.log(`[WebCache] Cache hit: ${url}`);
      return content;
    } catch (error) {
      console.error("[WebCache] Failed to decrypt cache entry:", error);
      await this.delete(url);
      return null;
    }
  }

  /**
   * Check if URL is cached and not expired
   */
  async has(url: string): Promise<boolean> {
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
    await this.db.run(`DELETE FROM cache WHERE url = ?`, url);
    console.log(`[WebCache] Deleted: ${url}`);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    await this.db.run(`DELETE FROM cache`);
    await this.db.run(`VACUUM`);
    console.log("[WebCache] Cache cleared");
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
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
   * Export cache as JSON
   */
  async export(): Promise<CacheEntry[]> {
    const rows = await this.db.all<{
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

    const entries: CacheEntry[] = [];

    for (const row of rows) {
      try {
        const decrypted = this.encryption.decrypt(row.content);
        const content = JSON.parse(decrypted) as PageContent;

        entries.push({
          url: row.url,
          content,
          cachedAt: new Date(row.cachedAt),
          expiresAt: new Date(row.expiresAt),
          size: row.size,
          encrypted: true,
        });
      } catch {
        console.error(`[WebCache] Failed to decrypt entry: ${row.url}`);
      }
    }

    return entries;
  }

  /**
   * Enforce cache size limit by evicting oldest entries
   */
  async enforceSizeLimit(
    maxSizeBytes: number,
    newEntrySize: number
  ): Promise<void> {
    const stats = await this.getStats();

    if (stats.totalSize + newEntrySize <= maxSizeBytes) {
      return;
    }

    // Delete oldest entries until we have space
    let deletedCount = 0;
    const currentStats = { ...stats };

    while (
      currentStats.totalSize + newEntrySize > maxSizeBytes &&
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
      if (newStats.totalSize <= currentStats.totalSize) break;
      Object.assign(currentStats, newStats);
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
}
