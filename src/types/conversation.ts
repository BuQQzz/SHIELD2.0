export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  truncated?: boolean;
  reasoning?: string; // AI's step-by-step reasoning (for web search responses)
  sources?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
}

export interface ConversationMetadata {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
}

export interface ConversationStorage {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
}
