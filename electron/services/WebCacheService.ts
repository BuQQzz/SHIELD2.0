import type { PageContent } from "./WebSearchService";
import { WebCacheStorage, CacheStats } from "./WebCacheStorage";
import { WebCacheEncryption } from "./WebCacheEncryption";

/**
 * Encrypted local cache service for web content
 * Uses SQLite with AES-256-GCM encryption for privacy
 * Migrated to sqlite3 (Node-API) for Electron 39 compatibility
 */

export interface CacheEntry {
  url: string;
  content: PageContent;
  cachedAt: Date;
  expiresAt: Date;
  size: number;
  encrypted: boolean;
}

export type { CacheStats };

export class WebCacheService {
  private storage: WebCacheStorage;
  private encryption: WebCacheEncryption;

  constructor(
    private readonly maxCacheSizeMB: number = 500,
    private readonly cacheExpiryHours: number = 168
  ) {
    this.storage = new WebCacheStorage();
    this.encryption = new WebCacheEncryption();
  }

  /**
   * Initialize the cache database and encryption
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
    this.encryption.initialize();
  }

  /**
   * Store content in encrypted cache
   */
  async set(url: string, content: PageContent): Promise<void> {
    if (!this.encryption.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.cacheExpiryHours * 60 * 60 * 1000
    );

    const serialized = JSON.stringify(content);
    const encrypted = this.encryption.encrypt(serialized);
    const size = Buffer.from(serialized).length;

    const maxSizeBytes = this.maxCacheSizeMB * 1024 * 1024;
    await this.storage.enforceSizeLimit(maxSizeBytes, size);

    await this.storage.set(url, encrypted, now, expiresAt, size);
  }

  /**
   * Retrieve content from cache
   */
  async get(url: string): Promise<PageContent | null> {
    if (!this.encryption.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    const row = await this.storage.get(url);

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
      await this.storage.delete(url);
      return null;
    }
  }

  /**
   * Check if URL is cached and not expired
   */
  async has(url: string): Promise<boolean> {
    return await this.storage.has(url);
  }

  /**
   * Delete a specific cache entry
   */
  async delete(url: string): Promise<void> {
    await this.storage.delete(url);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    await this.storage.clear();
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
    return await this.storage.clearExpired();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    return await this.storage.getStats();
  }

  /**
   * Export cache as JSON
   */
  async export(): Promise<CacheEntry[]> {
    if (!this.encryption.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    const rows = await this.storage.exportAll();
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
   * Cleanup database connection
   */
  async dispose(): Promise<void> {
    await this.storage.close();
  }
}

// Singleton instance
let webCacheService: WebCacheService | null = null;

export function getWebCacheService(
  maxCacheSizeMB?: number,
  cacheExpiryHours?: number
): WebCacheService {
  if (!webCacheService) {
    webCacheService = new WebCacheService(maxCacheSizeMB, cacheExpiryHours);
  }
  return webCacheService;
}
