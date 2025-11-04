import Database from "better-sqlite3";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { app } from "electron";
import path from "path";
import fs from "fs";
import type { PageContent } from "./WebSearchService";

/**
 * Encrypted local cache service for web content
 * Uses SQLite with AES-256-GCM encryption for privacy
 */

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

export class WebCacheService {
  private db: Database.Database | null = null;
  private encryptionKey: Buffer | null = null;
  private readonly algorithm = "aes-256-gcm";
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;

  constructor(
    private readonly maxCacheSizeMB: number = 500,
    private readonly cacheExpiryHours: number = 168
  ) {}

  /**
   * Initialize the cache database and encryption
   */
  async initialize(): Promise<void> {
    if (this.db) return;

    const userDataPath = app.getPath("userData");
    const dbPath = path.join(userDataPath, "web-cache.db");

    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    // Open database
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    // Create tables
    this.createTables();

    // Initialize encryption key
    this.initializeEncryption();

    console.log("[WebCache] Cache initialized at:", dbPath);
  }

  /**
   * Store content in encrypted cache
   */
  async set(url: string, content: PageContent): Promise<void> {
    if (!this.db || !this.encryptionKey) {
      throw new Error("Cache not initialized");
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.cacheExpiryHours * 60 * 60 * 1000
    );

    // Serialize and encrypt content
    const serialized = JSON.stringify(content);
    const encrypted = this.encrypt(serialized);
    const size = Buffer.from(serialized).length;

    // Check cache size limit
    await this.enforceSizeLimit(size);

    // Upsert into database
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache (url, content, cachedAt, expiresAt, size)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      url,
      encrypted,
      now.toISOString(),
      expiresAt.toISOString(),
      size
    );

    console.log(`[WebCache] Cached: ${url} (${this.formatSize(size)})`);
  }

  /**
   * Retrieve content from cache
   */
  async get(url: string): Promise<PageContent | null> {
    if (!this.db || !this.encryptionKey) {
      throw new Error("Cache not initialized");
    }

    const stmt = this.db.prepare(`
      SELECT content, cachedAt, expiresAt
      FROM cache
      WHERE url = ? AND expiresAt > ?
    `);

    const row = stmt.get(url, new Date().toISOString()) as
      | { content: Buffer; cachedAt: string; expiresAt: string }
      | undefined;

    if (!row) {
      console.log(`[WebCache] Cache miss: ${url}`);
      return null;
    }

    try {
      // Decrypt and deserialize
      const decrypted = this.decrypt(row.content);
      const content = JSON.parse(decrypted) as PageContent;

      console.log(`[WebCache] Cache hit: ${url}`);
      return content;
    } catch (error) {
      console.error("[WebCache] Failed to decrypt cache entry:", error);
      // Delete corrupted entry
      await this.delete(url);
      return null;
    }
  }

  /**
   * Check if URL is cached and not expired
   */
  async has(url: string): Promise<boolean> {
    if (!this.db) {
      throw new Error("Cache not initialized");
    }

    const stmt = this.db.prepare(`
      SELECT 1 FROM cache WHERE url = ? AND expiresAt > ?
    `);

    const result = stmt.get(url, new Date().toISOString());
    return !!result;
  }

  /**
   * Delete a specific cache entry
   */
  async delete(url: string): Promise<void> {
    if (!this.db) {
      throw new Error("Cache not initialized");
    }

    const stmt = this.db.prepare(`DELETE FROM cache WHERE url = ?`);
    stmt.run(url);

    console.log(`[WebCache] Deleted: ${url}`);
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    if (!this.db) {
      throw new Error("Cache not initialized");
    }

    this.db.prepare(`DELETE FROM cache`).run();
    this.db.prepare(`VACUUM`).run();

    console.log("[WebCache] Cache cleared");
  }

  /**
   * Clear expired entries
   */
  async clearExpired(): Promise<number> {
    if (!this.db) {
      throw new Error("Cache not initialized");
    }

    const stmt = this.db.prepare(`
      DELETE FROM cache WHERE expiresAt <= ?
    `);

    const result = stmt.run(new Date().toISOString());
    const deletedCount = result.changes;

    if (deletedCount > 0) {
      this.db.prepare(`VACUUM`).run();
      console.log(`[WebCache] Cleared ${deletedCount} expired entries`);
    }

    return deletedCount;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (!this.db) {
      throw new Error("Cache not initialized");
    }

    const statsStmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalEntries,
        SUM(size) as totalSize,
        MIN(cachedAt) as oldestEntry,
        MAX(cachedAt) as newestEntry
      FROM cache
      WHERE expiresAt > ?
    `);

    const stats = statsStmt.get(new Date().toISOString()) as {
      totalEntries: number;
      totalSize: number;
      oldestEntry?: string;
      newestEntry?: string;
    };

    return {
      totalEntries: stats.totalEntries || 0,
      totalSize: stats.totalSize || 0,
      oldestEntry: stats.oldestEntry
        ? new Date(stats.oldestEntry)
        : undefined,
      newestEntry: stats.newestEntry
        ? new Date(stats.newestEntry)
        : undefined,
    };
  }

  /**
   * Export cache as JSON
   */
  async export(): Promise<CacheEntry[]> {
    if (!this.db || !this.encryptionKey) {
      throw new Error("Cache not initialized");
    }

    const stmt = this.db.prepare(`
      SELECT url, content, cachedAt, expiresAt, size
      FROM cache
      WHERE expiresAt > ?
      ORDER BY cachedAt DESC
    `);

    const rows = stmt.all(new Date().toISOString()) as Array<{
      url: string;
      content: Buffer;
      cachedAt: string;
      expiresAt: string;
      size: number;
    }>;

    const entries: CacheEntry[] = [];

    for (const row of rows) {
      try {
        const decrypted = this.decrypt(row.content);
        const content = JSON.parse(decrypted) as PageContent;

        entries.push({
          url: row.url,
          content,
          cachedAt: new Date(row.cachedAt),
          expiresAt: new Date(row.expiresAt),
          size: row.size,
          encrypted: true,
        });
      } catch (error) {
        console.error(`[WebCache] Failed to decrypt entry: ${row.url}`);
      }
    }

    return entries;
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
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
   * Initialize encryption key
   */
  private initializeEncryption(): void {
    const userDataPath = app.getPath("userData");
    const keyPath = path.join(userDataPath, ".cache-key");

    try {
      // Try to load existing key
      if (fs.existsSync(keyPath)) {
        const keyData = fs.readFileSync(keyPath);
        this.encryptionKey = Buffer.from(keyData.toString("utf-8"), "hex");
      } else {
        // Generate new key
        const salt = randomBytes(16);
        const password = randomBytes(32).toString("hex");
        this.encryptionKey = scryptSync(password, salt, this.keyLength);

        // Save key securely
        fs.writeFileSync(keyPath, this.encryptionKey.toString("hex"), {
          mode: 0o600, // Read/write for owner only
        });

        console.log("[WebCache] Generated new encryption key");
      }
    } catch (error) {
      console.error("[WebCache] Failed to initialize encryption:", error);
      throw new Error("Failed to initialize cache encryption");
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: string): Buffer {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    const iv = randomBytes(this.ivLength);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(data, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Combine: IV (16) + encrypted data + auth tag (16)
    return Buffer.concat([iv, encrypted, tag]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(encrypted: Buffer): string {
    if (!this.encryptionKey) {
      throw new Error("Encryption key not initialized");
    }

    // Extract components
    const iv = encrypted.subarray(0, this.ivLength);
    const tag = encrypted.subarray(encrypted.length - this.tagLength);
    const data = encrypted.subarray(this.ivLength, encrypted.length - this.tagLength);

    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    return decipher.update(data) + decipher.final("utf8");
  }

  /**
   * Enforce cache size limit
   */
  private async enforceSizeLimit(newEntrySize: number): Promise<void> {
    if (!this.db) return;

    const maxSizeBytes = this.maxCacheSizeMB * 1024 * 1024;
    const stats = await this.getStats();

    if (stats.totalSize + newEntrySize <= maxSizeBytes) {
      return;
    }

    // Delete oldest entries until we have space
    const stmt = this.db.prepare(`
      DELETE FROM cache
      WHERE url IN (
        SELECT url FROM cache
        ORDER BY cachedAt ASC
        LIMIT ?
      )
    `);

    let deletedCount = 0;
    while (stats.totalSize + newEntrySize > maxSizeBytes && deletedCount < 100) {
      stmt.run(10);
      deletedCount += 10;

      const newStats = await this.getStats();
      if (newStats.totalSize <= stats.totalSize) break; // Safety check
      Object.assign(stats, newStats);
    }

    if (deletedCount > 0) {
      this.db.prepare(`VACUUM`).run();
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
   * Cleanup database connection
   */
  async dispose(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log("[WebCache] Cache closed");
    }
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
