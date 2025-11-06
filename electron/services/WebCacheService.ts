import type { PageContent } from "./WebSearchService";
import { WebCacheEncryption } from "./WebCacheEncryption";
import {
  WebCacheStorage,
  type CacheEntry as StorageCacheEntry,
  type CacheStats,
} from "./WebCacheStorage";

/**
 * Encrypted local cache service for web content
 * Uses SQLite with AES-256-GCM encryption for privacy
 * Coordinates encryption and storage operations
 */

export interface CacheEntry {
  url: string;
  content: PageContent;
  cachedAt: Date;
  expiresAt: Date;
  size: number;
  encrypted: boolean;
}

export { CacheStats } from "./WebCacheStorage";

export class WebCacheService {
  private encryption: WebCacheEncryption;
  private storage: WebCacheStorage;

  constructor(
    private readonly maxCacheSizeMB: number = 500,
    private readonly cacheExpiryHours: number = 168
  ) {
    this.encryption = new WebCacheEncryption();
    this.storage = new WebCacheStorage();
  }

  /**
   * Initialize the cache database and encryption
   */
  async initialize(): Promise<void> {
    await this.storage.initialize();
    this.encryption.initialize();
    console.log("[WebCache] Cache initialized");
  }

  /**
   * Store content in encrypted cache
   */
  async set(url: string, content: PageContent): Promise<void> {
    if (!this.storage.isInitialized() || !this.encryption.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    const serialized = JSON.stringify(content);
    const encrypted = this.encryption.encrypt(serialized);
    const size = Buffer.from(serialized).length;

    // Check cache size limit
    const maxSizeBytes = this.maxCacheSizeMB * 1024 * 1024;
    const evictedCount = await this.storage.enforceSizeLimit(
      maxSizeBytes,
      size
    );

    if (evictedCount > 0) {
      console.log(`[WebCache] Evicted ${evictedCount} entries to free space`);
    }

    // Store in database
    await this.storage.set(url, encrypted, size, this.cacheExpiryHours);

    console.log(`[WebCache] Cached: ${url} (${this.formatSize(size)})`);
  }

  /**
   * Retrieve content from cache
   */
  async get(url: string): Promise<PageContent | null> {
    if (!this.storage.isInitialized() || !this.encryption.isInitialized()) {
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
      await this.delete(url);
      return null;
    }
  }

  /**
   * Check if URL is cached and not expired
   */
  async has(url: string): Promise<boolean> {
    if (!this.storage.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    return await this.storage.has(url);
  }

  /**
   * Delete a specific cache entry
   */
  async delete(url: string): Promise<void> {
    if (!this.storage.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    await this.storage.delete(url);
    console.log(`[WebCache] Deleted: ${url}`);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.storage.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    await this.storage.clear();
    console.log("[WebCache] Cache cleared");
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
    if (!this.storage.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    const deletedCount = await this.storage.clearExpired();

    if (deletedCount > 0) {
      console.log(`[WebCache] Cleared ${deletedCount} expired entries`);
    }

    return deletedCount;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (!this.storage.isInitialized()) {
      throw new Error("Cache not initialized");
    }

    return await this.storage.getStats();
  }

  /**
   * Export cache as JSON
   */
  async export(): Promise<CacheEntry[]> {
    if (!this.storage.isInitialized() || !this.encryption.isInitialized()) {
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
   * Format size in human-readable format
   */
  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  /**
   * Cleanup database connection
   */
  async dispose(): Promise<void> {
    await this.storage.dispose();
    console.log("[WebCache] Cache closed");
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
