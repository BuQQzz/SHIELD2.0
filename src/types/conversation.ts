export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  truncated?: boolean;
  reasoning?: string; // AI's step-by-step reasoning (for web search responses)
  thinking?: string; // AI's chain-of-thought analysis (extracted from XML tags)
  isThinking?: boolean; // True while streaming thinking content
  /** Tokens and speed of the reply, shown under assistant messages */
  stats?: {
    outputTokens: number;
    tokensPerSecond: number;
    durationMs: number;
  };
  sources?: Array<{
    title: string;
    url: string;
    snippet: string;
    position: number;
  }>;
  /**
   * Set when this message is an MCP tool result rather than something the
   * user typed. It is stored with role "user" because that is how the model's
   * chat template expects tool output, but it must not be rendered as if the
   * user wrote it.
   */
  toolResult?: {
    tool: string;
    serverName: string;
    success: boolean;
    /**
     * Plan mode refused to run this. Not a failure - the mode working as
     * intended - so it must not be presented as an error.
     */
    blocked?: boolean;
  };
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
