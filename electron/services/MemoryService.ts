/**
 * Memory Service - RAG-based learning from conversation history
 * Stores conversation snippets with embeddings for semantic search
 */

import { createRequire } from "module";
import { DatabaseWrapper } from "./MemoryDatabaseWrapper";
import { MemoryOperations, type SearchableMemory } from "./MemoryOperations";
import { MemoryStats } from "./MemoryStats";

const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3").verbose();

// Re-export types for external use
export type { SearchableMemory };

export class MemoryService {
  private db: DatabaseWrapper | null = null;
  private dbPath: string;
  private maxMemories: number = 1000;
  private operations: MemoryOperations | null = null;
  private stats: MemoryStats | null = null;

  constructor(dbPath: string = "./data/memory.db") {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the memory database
   */
  async initialize(): Promise<void> {
    const rawDb = new sqlite3.Database(this.dbPath);
    this.db = new DatabaseWrapper(rawDb);
    this.operations = new MemoryOperations(this.db);
    this.stats = new MemoryStats(this.db, this.maxMemories);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversationId TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        userMessage TEXT NOT NULL,
        assistantResponse TEXT NOT NULL,
        topics TEXT,
        wasHelpful INTEGER,
        userCorrection TEXT,
        metadata TEXT
      )
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp DESC)
    `);

    await this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_conversation ON memories(conversationId)
    `);

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
    if (!this.db || !this.stats) throw new Error("MemoryService not initialized");

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

    const result = await this.db.get<{ id: number }>(
      `SELECT last_insert_rowid() as id`
    );

    await this.stats.cleanupOldMemories();

    console.log(`[MemoryService] Stored memory #${result?.id}`);
    return result?.id || 0;
  }

  /**
   * Search for relevant memories using simple keyword matching
   */
  async searchMemories(
    query: string,
    limit: number = 5
  ): Promise<SearchableMemory[]> {
    if (!this.operations) throw new Error("MemoryService not initialized");
    return this.operations.searchMemories(query, limit);
  }

  /**
   * Mark a memory as helpful or not
   */
  async setFeedback(memoryId: number, wasHelpful: boolean): Promise<void> {
    if (!this.operations) throw new Error("MemoryService not initialized");
    return this.operations.setFeedback(memoryId, wasHelpful);
  }

  /**
   * Store a user correction
   */
  async addCorrection(memoryId: number, correction: string): Promise<void> {
    if (!this.operations) throw new Error("MemoryService not initialized");
    return this.operations.addCorrection(memoryId, correction);
  }

  /**
   * Get user preference
   */
  async getPreference(key: string): Promise<string | null> {
    if (!this.operations) throw new Error("MemoryService not initialized");
    return this.operations.getPreference(key);
  }

  /**
   * Set user preference
   */
  async setPreference(key: string, value: string): Promise<void> {
    if (!this.operations) throw new Error("MemoryService not initialized");
    return this.operations.setPreference(key, value);
  }

  /**
   * Get recent helpful memories for general context
   */
  async getRecentHelpfulMemories(
    limit: number = 10
  ): Promise<SearchableMemory[]> {
    if (!this.operations) throw new Error("MemoryService not initialized");
    return this.operations.getRecentHelpfulMemories(limit);
  }

  /**
   * Get statistics about stored memories
   */
  async getStats(): Promise<{
    total: number;
    helpful: number;
    withCorrections: number;
  }> {
    if (!this.stats) throw new Error("MemoryService not initialized");
    return this.stats.getStats();
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
