/**
 * Memory Service - RAG-based learning from conversation history
 * Stores conversation snippets with embeddings for semantic search
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3").verbose();

interface MemoryEntry {
  id: number;
  conversationId: string;
  timestamp: number;
  userMessage: string;
  assistantResponse: string;
  topics: string[];
  wasHelpful?: boolean; // User feedback
  userCorrection?: string; // If user corrected the response
  metadata: Record<string, unknown>;
}

interface SearchableMemory {
  userMessage: string;
  assistantResponse: string;
  topics: string[];
  relevanceScore: number;
}

type Database = unknown;
type SqliteError = Error | null;

class DatabaseWrapper {
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

export class MemoryService {
  private db: DatabaseWrapper | null = null;
  private dbPath: string;
  private maxMemories: number = 1000; // Keep last 1000 interactions

  constructor(dbPath: string = "./data/memory.db") {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the memory database
   */
  async initialize(): Promise<void> {
    const rawDb = new sqlite3.Database(this.dbPath);
    this.db = new DatabaseWrapper(rawDb);

    // Create memories table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversationId TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        userMessage TEXT NOT NULL,
        assistantResponse TEXT NOT NULL,
        topics TEXT, -- JSON array of topic keywords
        wasHelpful INTEGER, -- 1=helpful, 0=not helpful, null=no feedback
        userCorrection TEXT, -- User's correction if any
        metadata TEXT -- JSON metadata
      )
    `);

    // Create index for faster searches
    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp DESC)
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_conversation ON memories(conversationId)
    `);

    // Create user preferences table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        lastUpdated INTEGER NOT NULL
      )
    `);

    console.log("[MemoryService] Initialized");
  }

  /**
   * Store a conversation exchange in memory
   */
  async addMemory(
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
    topics: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<number> {
    if (!this.db) throw new Error("MemoryService not initialized");

    const timestamp = Date.now();
    
    await this.db.run(
      `INSERT INTO memories (conversationId, timestamp, userMessage, assistantResponse, topics, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      conversationId,
      timestamp,
      userMessage,
      assistantResponse,
      JSON.stringify(topics),
      JSON.stringify(metadata)
    );

    // Get the inserted ID
    const result = await this.db.get<{ id: number }>(
      `SELECT last_insert_rowid() as id`
    );

    // Clean up old memories if we exceed the limit
    await this.cleanupOldMemories();

    console.log(`[MemoryService] Stored memory #${result?.id}`);
    return result?.id || 0;
  }

  /**
   * Search for relevant memories using simple keyword matching
   * In a full implementation, this would use embeddings for semantic search
   */
  async searchMemories(query: string, limit: number = 5): Promise<SearchableMemory[]> {
    if (!this.db) throw new Error("MemoryService not initialized");

    // Simple keyword-based search (would use embeddings in production)
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3);
    
    if (keywords.length === 0) return [];

    // Build search query
    const searchCondition = keywords
      .map(() => "(LOWER(userMessage) LIKE ? OR LOWER(assistantResponse) LIKE ?)")
      .join(" OR ");
    
    const searchParams = keywords.flatMap(kw => [`%${kw}%`, `%${kw}%`]);

    const memories = await this.db.all<MemoryEntry>(
      `SELECT * FROM memories 
       WHERE ${searchCondition}
       AND wasHelpful IS NOT FALSE
       ORDER BY timestamp DESC 
       LIMIT ?`,
      ...searchParams,
      limit
    );

    return memories.map(m => ({
      userMessage: m.userMessage,
      assistantResponse: m.assistantResponse,
      topics: typeof m.topics === 'string' ? JSON.parse(m.topics) : [],
      relevanceScore: 0.5, // Simple scoring
    }));
  }

  /**
   * Mark a memory as helpful or not
   */
  async setFeedback(memoryId: number, wasHelpful: boolean): Promise<void> {
    if (!this.db) throw new Error("MemoryService not initialized");

    await this.db.run(
      `UPDATE memories SET wasHelpful = ? WHERE id = ?`,
      wasHelpful ? 1 : 0,
      memoryId
    );

    console.log(`[MemoryService] Feedback recorded for memory #${memoryId}: ${wasHelpful}`);
  }

  /**
   * Store a user correction
   */
  async addCorrection(memoryId: number, correction: string): Promise<void> {
    if (!this.db) throw new Error("MemoryService not initialized");

    await this.db.run(
      `UPDATE memories SET userCorrection = ?, wasHelpful = 0 WHERE id = ?`,
      correction,
      memoryId
    );

    console.log(`[MemoryService] Correction recorded for memory #${memoryId}`);
  }

  /**
   * Get user preference
   */
  async getPreference(key: string): Promise<string | null> {
    if (!this.db) throw new Error("MemoryService not initialized");

    const result = await this.db.get<{ value: string }>(
      `SELECT value FROM preferences WHERE key = ?`,
      key
    );

    return result?.value || null;
  }

  /**
   * Set user preference
   */
  async setPreference(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error("MemoryService not initialized");

    await this.db.run(
      `INSERT OR REPLACE INTO preferences (key, value, lastUpdated)
       VALUES (?, ?, ?)`,
      key,
      value,
      Date.now()
    );

    console.log(`[MemoryService] Preference set: ${key} = ${value}`);
  }

  /**
   * Get recent helpful memories for general context
   */
  async getRecentHelpfulMemories(limit: number = 10): Promise<SearchableMemory[]> {
    if (!this.db) throw new Error("MemoryService not initialized");

    const memories = await this.db.all<MemoryEntry>(
      `SELECT * FROM memories 
       WHERE wasHelpful = 1
       ORDER BY timestamp DESC 
       LIMIT ?`,
      limit
    );

    return memories.map(m => ({
      userMessage: m.userMessage,
      assistantResponse: m.assistantResponse,
      topics: typeof m.topics === 'string' ? JSON.parse(m.topics) : [],
      relevanceScore: 1.0,
    }));
  }

  /**
   * Clean up old memories beyond the limit
   */
  private async cleanupOldMemories(): Promise<void> {
    if (!this.db) return;

    const count = await this.db.get<{ total: number }>(
      `SELECT COUNT(*) as total FROM memories`
    );

    if (count && count.total > this.maxMemories) {
      const toDelete = count.total - this.maxMemories;
      await this.db.run(
        `DELETE FROM memories WHERE id IN (
          SELECT id FROM memories ORDER BY timestamp ASC LIMIT ?
        )`,
        toDelete
      );
      console.log(`[MemoryService] Cleaned up ${toDelete} old memories`);
    }
  }

  /**
   * Get statistics about stored memories
   */
  async getStats(): Promise<{
    total: number;
    helpful: number;
    withCorrections: number;
  }> {
    if (!this.db) throw new Error("MemoryService not initialized");

    const total = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM memories`
    );

    const helpful = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM memories WHERE wasHelpful = 1`
    );

    const corrections = await this.db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM memories WHERE userCorrection IS NOT NULL`
    );

    return {
      total: total?.count || 0,
      helpful: helpful?.count || 0,
      withCorrections: corrections?.count || 0,
    };
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log("[MemoryService] Closed");
    }
  }
}

export const memoryService = new MemoryService();
