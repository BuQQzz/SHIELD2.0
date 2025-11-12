/**
 * Memory Service - RAG-based learning from conversation history
 * Stores conversation snippets with embeddings for semantic search
 */

import { createRequire } from "module";
import { DatabaseWrapper } from "./memory/DatabaseWrapper.js";
import type { SearchableMemory } from "./memory/types.js";
import * as queries from "./memory/MemoryQueries.js";

const require = createRequire(import.meta.url);
const sqlite3 = require("sqlite3").verbose();

export class MemoryService {
  private db: DatabaseWrapper | null = null;
  private dbPath: string;
  private maxMemories: number = 1000; // Keep last 1000 interactions

  constructor(dbPath: string = "./data/memory.db") {
    this.dbPath = dbPath;
  }

  /** Initialize the memory database */
  async initialize(): Promise<void> {
    const rawDb = new sqlite3.Database(this.dbPath);
    this.db = new DatabaseWrapper(rawDb);
    await queries.initializeSchema(this.db);
    console.log("[MemoryService] Initialized");
  }

  /** Store a conversation exchange in memory */
  async addMemory(
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
    topics: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<number> {
    if (!this.db) throw new Error("MemoryService not initialized");

    const memoryId = await queries.addMemory(
      this.db,
      conversationId,
      userMessage,
      assistantResponse,
      topics,
      metadata
    );

    await this.cleanupOldMemories();
    console.log(`[MemoryService] Stored memory #${memoryId}`);
    return memoryId;
  }

  /** Search for relevant memories using keyword matching */
  async searchMemories(
    query: string,
    limit: number = 5
  ): Promise<SearchableMemory[]> {
    if (!this.db) throw new Error("MemoryService not initialized");
    return queries.searchMemories(this.db, query, limit);
  }

  /** Mark a memory as helpful or not */
  async setFeedback(memoryId: number, wasHelpful: boolean): Promise<void> {
    if (!this.db) throw new Error("MemoryService not initialized");
    await queries.setFeedback(this.db, memoryId, wasHelpful);
    console.log(
      `[MemoryService] Feedback recorded for memory #${memoryId}: ${wasHelpful}`
    );
  }

  /** Store a user correction */
  async addCorrection(memoryId: number, correction: string): Promise<void> {
    if (!this.db) throw new Error("MemoryService not initialized");
    await queries.addCorrection(this.db, memoryId, correction);
    console.log(`[MemoryService] Correction recorded for memory #${memoryId}`);
  }

  /** Get user preference */
  async getPreference(key: string): Promise<string | null> {
    if (!this.db) throw new Error("MemoryService not initialized");
    return queries.getPreference(this.db, key);
  }

  /** Set user preference */
  async setPreference(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error("MemoryService not initialized");
    await queries.setPreference(this.db, key, value);
    console.log(`[MemoryService] Preference set: ${key} = ${value}`);
  }

  /** Get recent helpful memories for general context */
  async getRecentHelpfulMemories(
    limit: number = 10
  ): Promise<SearchableMemory[]> {
    if (!this.db) throw new Error("MemoryService not initialized");
    return queries.getRecentHelpfulMemories(this.db, limit);
  }

  /** Clean up old memories beyond the limit */
  private async cleanupOldMemories(): Promise<void> {
    if (!this.db) return;
    const deleted = await queries.cleanupOldMemories(this.db, this.maxMemories);
    if (deleted > 0) {
      console.log(`[MemoryService] Cleaned up ${deleted} old memories`);
    }
  }

  /** Get statistics about stored memories */
  async getStats(): Promise<{
    total: number;
    helpful: number;
    withCorrections: number;
  }> {
    if (!this.db) throw new Error("MemoryService not initialized");
    return queries.getStats(this.db);
  }

  /** Close the database connection */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      console.log("[MemoryService] Closed");
    }
  }
}

export const memoryService = new MemoryService();
