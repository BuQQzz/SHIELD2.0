import type { SavedCapsule } from "./electron";
import type { Plan } from "../config/plan";
import type { AgentRunView } from "../agents/runView";

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
  /**
   * The model's history was too full before this reply, and its oldest
   * turns were replaced by this summary (the model's copy only). Shown as a
   * step in the reply.
   */
  summary?: string;
  /** That summary as data: a restored chat resumes from it */
  capsule?: SavedCapsule;
  sources?: Array<{
    title: string;
    url: string;
    snippet: string;
    position: number;
  }>;
  /**
   * Tool calls the model wrote that were never run because the turn hit its
   * tool-round limit, e.g. "write_file C:\p\index.html". Set on the
   * notice shown to the user; the next prompt tells the model about them.
   */
  unrunToolCalls?: string[];
  /**
   * On a notice that ended a turn early (tool-round limit, no progress, a
   * repeated step): the last one in the chat gets a Continue button
   */
  resumable?: boolean;
  /**
   * On a reply that talks about a change whose edit failed and is still not
   * in the file: SHIELD's record, shown to the user under the reply
   * (workLedger.recordNoteFor).
   */
  recordNote?: string;
  /**
   * Sent while the turn was running (steer, handlers/steer.ts): shown inside
   * the reply it went into, not as a new turn
   */
  steer?: boolean;
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
    /** The file or folder it acted on, for the step's label */
    target?: string;
    /**
     * Plan mode refused to run this. Not a failure - the mode working as
     * intended - so it must not be presented as an error.
     */
    blocked?: boolean;
  };
}

/**
 * Chat is plain conversation; code is a session on a project folder, with
 * the file tools. Conversations from before the split have no kind: chat.
 */
export type ConversationKind = "chat" | "code";

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
  kind?: ConversationKind;
  /** A code session's project folder */
  folder?: string;
  /** The project this conversation runs under */
  projectId?: string;
  /** A code session's live checklist (update_plan, or edited by the user) */
  plan?: Plan;
  /** A code session led by an orchestrator that delegates to sub-agents (src/agents) */
  team?: boolean;
  /** The model the user accepted the "not suited to a team" caution for */
  teamOverride?: string;
  /** What the team's agents did, for the Team panel after a restart */
  agentRuns?: AgentRunView[];
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
  kind?: ConversationKind;
  folder?: string;
  projectId?: string;
}

export interface ConversationStorage {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
}
