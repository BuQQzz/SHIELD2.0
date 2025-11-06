/**
 * Memory Operations - Search, query, and retrieval operations for memory service
 */

import { DatabaseWrapper } from "./MemoryDatabaseWrapper";

export interface MemoryEntry {
  id: number;
  conversationId: string;
  timestamp: number;
  userMessage: string;
  assistantResponse: string;
  topics: string[];
  wasHelpful?: boolean;
  userCorrection?: string;
  metadata: Record<string, unknown>;
}

export interface SearchableMemory {
  userMessage: string;
  assistantResponse: string;
  topics: string[];
  relevanceScore: number;
}

/**
 * Handles memory search and retrieval operations
 */
export class MemoryOperations {
  constructor(private db: DatabaseWrapper) {}

  /**
   * Search for relevant memories using simple keyword matching
   * In a full implementation, this would use embeddings for semantic search
   */
  async searchMemories(
    query: string,
    limit: number = 5
  ): Promise<SearchableMemory[]> {
    // Simple keyword-based search (would use embeddings in production)
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 3);

    if (keywords.length === 0) return [];

    // Build search query
    const searchCondition = keywords
      .map(
        () => "(LOWER(userMessage) LIKE ? OR LOWER(assistantResponse) LIKE ?)"
      )
      .join(" OR ");

    const searchParams = keywords.flatMap((kw) => [`%${kw}%`, `%${kw}%`]);

    const memories = await this.db.all<MemoryEntry>(
      `SELECT * FROM memories 
       WHERE ${searchCondition}
       AND wasHelpful IS NOT FALSE
       ORDER BY timestamp DESC 
       LIMIT ?`,
      ...searchParams,
      limit
    );

    return memories.map((m) => ({
      userMessage: m.userMessage,
      assistantResponse: m.assistantResponse,
      topics: typeof m.topics === "string" ? JSON.parse(m.topics) : [],
      relevanceScore: 0.5,
    }));
  }

  /**
   * Get recent helpful memories for general context
   */
  async getRecentHelpfulMemories(
    limit: number = 10
  ): Promise<SearchableMemory[]> {
    const memories = await this.db.all<MemoryEntry>(
      `SELECT * FROM memories 
       WHERE wasHelpful = 1
       ORDER BY timestamp DESC 
       LIMIT ?`,
      limit
    );

    return memories.map((m) => ({
      userMessage: m.userMessage,
      assistantResponse: m.assistantResponse,
      topics: typeof m.topics === "string" ? JSON.parse(m.topics) : [],
      relevanceScore: 1.0,
    }));
  }

  /**
   * Mark a memory as helpful or not
   */
  async setFeedback(memoryId: number, wasHelpful: boolean): Promise<void> {
    await this.db.run(
      `UPDATE memories SET wasHelpful = ? WHERE id = ?`,
      wasHelpful ? 1 : 0,
      memoryId
    );

    console.log(
      `[MemoryService] Feedback recorded for memory #${memoryId}: ${wasHelpful}`
    );
  }

  /**
   * Store a user correction
   */
  async addCorrection(memoryId: number, correction: string): Promise<void> {
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
    await this.db.run(
      `INSERT OR REPLACE INTO preferences (key, value, lastUpdated)
       VALUES (?, ?, ?)`,
      key,
      value,
      Date.now()
    );

    console.log(`[MemoryService] Preference set: ${key} = ${value}`);
  }
}
