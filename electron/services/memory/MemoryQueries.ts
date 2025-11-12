/**
 * Memory Queries - Database operations for memory storage
 */

import type { DatabaseWrapper } from "./DatabaseWrapper.js";
import type { MemoryEntry, SearchableMemory } from "./types.js";

/** Initialize database schema */
export async function initializeSchema(db: DatabaseWrapper): Promise<void> {
  // Create memories table
  await db.run(`
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

  // Create indexes for faster searches
  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp DESC)
  `);

  await db.run(`
    CREATE INDEX IF NOT EXISTS idx_conversation ON memories(conversationId)
  `);

  // Create user preferences table
  await db.run(`
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      lastUpdated INTEGER NOT NULL
    )
  `);
}

/** Add a new memory entry */
export async function addMemory(
  db: DatabaseWrapper,
  conversationId: string,
  userMessage: string,
  assistantResponse: string,
  topics: string[] = [],
  metadata: Record<string, unknown> = {}
): Promise<number> {
  const timestamp = Date.now();

  await db.run(
    `INSERT INTO memories (conversationId, timestamp, userMessage, assistantResponse, topics, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    conversationId,
    timestamp,
    userMessage,
    assistantResponse,
    JSON.stringify(topics),
    JSON.stringify(metadata)
  );

  const result = await db.get<{ id: number }>(
    `SELECT last_insert_rowid() as id`
  );

  return result?.id || 0;
}

/** Search for relevant memories using keyword matching */
export async function searchMemories(
  db: DatabaseWrapper,
  query: string,
  limit: number = 5
): Promise<SearchableMemory[]> {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 3);

  if (keywords.length === 0) return [];

  const searchCondition = keywords
    .map(() => "(LOWER(userMessage) LIKE ? OR LOWER(assistantResponse) LIKE ?)")
    .join(" OR ");

  const searchParams = keywords.flatMap((kw) => [`%${kw}%`, `%${kw}%`]);

  const memories = await db.all<MemoryEntry>(
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

/** Get recent helpful memories */
export async function getRecentHelpfulMemories(
  db: DatabaseWrapper,
  limit: number = 10
): Promise<SearchableMemory[]> {
  const memories = await db.all<MemoryEntry>(
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

/** Set feedback for a memory */
export async function setFeedback(
  db: DatabaseWrapper,
  memoryId: number,
  wasHelpful: boolean
): Promise<void> {
  await db.run(
    `UPDATE memories SET wasHelpful = ? WHERE id = ?`,
    wasHelpful ? 1 : 0,
    memoryId
  );
}

/** Add correction to a memory */
export async function addCorrection(
  db: DatabaseWrapper,
  memoryId: number,
  correction: string
): Promise<void> {
  await db.run(
    `UPDATE memories SET userCorrection = ?, wasHelpful = 0 WHERE id = ?`,
    correction,
    memoryId
  );
}

/** Get user preference */
export async function getPreference(
  db: DatabaseWrapper,
  key: string
): Promise<string | null> {
  const result = await db.get<{ value: string }>(
    `SELECT value FROM preferences WHERE key = ?`,
    key
  );
  return result?.value || null;
}

/** Set user preference */
export async function setPreference(
  db: DatabaseWrapper,
  key: string,
  value: string
): Promise<void> {
  await db.run(
    `INSERT OR REPLACE INTO preferences (key, value, lastUpdated)
     VALUES (?, ?, ?)`,
    key,
    value,
    Date.now()
  );
}

/** Clean up old memories beyond the limit */
export async function cleanupOldMemories(
  db: DatabaseWrapper,
  maxMemories: number
): Promise<number> {
  const count = await db.get<{ total: number }>(
    `SELECT COUNT(*) as total FROM memories`
  );

  if (count && count.total > maxMemories) {
    const toDelete = count.total - maxMemories;
    await db.run(
      `DELETE FROM memories WHERE id IN (
        SELECT id FROM memories ORDER BY timestamp ASC LIMIT ?
      )`,
      toDelete
    );
    return toDelete;
  }

  return 0;
}

/** Get memory statistics */
export async function getStats(db: DatabaseWrapper): Promise<{
  total: number;
  helpful: number;
  withCorrections: number;
}> {
  const total = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM memories`
  );

  const helpful = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM memories WHERE wasHelpful = 1`
  );

  const corrections = await db.get<{ count: number }>(
    `SELECT COUNT(*) as count FROM memories WHERE userCorrection IS NOT NULL`
  );

  return {
    total: total?.count || 0,
    helpful: helpful?.count || 0,
    withCorrections: corrections?.count || 0,
  };
}
