/**
 * Memory Statistics - Cleanup and statistics operations for memory service
 */

import { DatabaseWrapper } from "./MemoryDatabaseWrapper";

/**
 * Handles memory cleanup and statistics operations
 */
export class MemoryStats {
  constructor(
    private db: DatabaseWrapper,
    private maxMemories: number = 1000
  ) {}

  /**
   * Clean up old memories beyond the limit
   */
  async cleanupOldMemories(): Promise<void> {
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
}
