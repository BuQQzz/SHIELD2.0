import type { PageContent } from "./WebSearchService";
import { WebCacheStorage } from "./web-cache/WebCacheStorage";
import { WebCacheEncryption } from "./web-cache/WebCacheEncryption";
import {
  CacheOperations,
  type CacheEntry,
  type CacheStats,
} from "./web-cache/CacheOperations";

/**
 * Encrypted local cache service for web content
 * Uses SQLite with AES-256-GCM encryption for privacy
 * Migrated to sqlite3 (Node-API) for Electron 39 compatibility
 */

export type { CacheEntry, CacheStats };

export class WebCacheService {
  private storage: WebCacheStorage;
  private encryption: WebCacheEncryption;
  private operations: CacheOperations | null = null;

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
    if (this.storage.isInitialized()) return;

    const db = await this.storage.initialize();
    this.encryption.initialize();
    this.operations = new CacheOperations(db, this.encryption);
  }

  /**
   * Ensure operations are initialized
   */
  private ensureInitialized(): CacheOperations {
    if (!this.operations) {
      throw new Error("Cache not initialized");
    }
    return this.operations;
  }

  /**
   * Store content in encrypted cache
   */
  async set(url: string, content: PageContent): Promise<void> {
    const ops = this.ensureInitialized();

    const expiresAt = new Date(
      Date.now() + this.cacheExpiryHours * 60 * 60 * 1000
    );

    const serialized = JSON.stringify(content);
    const size = Buffer.from(serialized).length;

    // Enforce cache size limit
    const maxSizeBytes = this.maxCacheSizeMB * 1024 * 1024;
    await ops.enforceSizeLimit(maxSizeBytes, size);

    await ops.set(url, content, expiresAt, size);
  }

  /**
   * Retrieve content from cache
   */
  async get(url: string): Promise<PageContent | null> {
    const ops = this.ensureInitialized();
    return ops.get(url);
  }

  /**
   * Check if URL is cached and not expired
   */
  async has(url: string): Promise<boolean> {
    const ops = this.ensureInitialized();
    return ops.has(url);
  }

  /**
   * Delete a specific cache entry
   */
  async delete(url: string): Promise<void> {
    const ops = this.ensureInitialized();
    return ops.delete(url);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    const ops = this.ensureInitialized();
    return ops.clear();
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
    const ops = this.ensureInitialized();
    return ops.clearExpired();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const ops = this.ensureInitialized();
    return ops.getStats();
  }

  /**
   * Export cache as JSON
   */
  async export(): Promise<CacheEntry[]> {
    const ops = this.ensureInitialized();
    return ops.export();
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
