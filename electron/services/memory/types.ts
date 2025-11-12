/**
 * Memory Service Types
 */

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
