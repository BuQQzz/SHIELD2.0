/**
 * Session Manager - Handles chat session management
 * Manages chat history, system prompts, and session state
 */

import { LlamaContext, LlamaChatSession } from "node-llama-cpp";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface SessionConfig {
  context: LlamaContext;
  systemPrompt: string;
}

/**
 * Creates a new chat session
 */
export function createSession(config: SessionConfig): LlamaChatSession {
  return new LlamaChatSession({
    contextSequence: config.context.getSequence(),
    systemPrompt: config.systemPrompt,
  });
}

/**
 * Recreates session with new system prompt, preserving chat history
 */
export function recreateSessionWithPrompt(
  session: LlamaChatSession,
  context: LlamaContext,
  newSystemPrompt: string
): LlamaChatSession {
  // Save current chat history
  const currentHistory = session.getChatHistory();

  // Create new session with updated system prompt
  const newSession = new LlamaChatSession({
    contextSequence: context.getSequence(),
    systemPrompt: newSystemPrompt,
  });

  // Restore chat history if it exists
  if (currentHistory && currentHistory.length > 0) {
    newSession.setChatHistory(currentHistory);
  }

  return newSession;
}

/**
 * Converts chat messages to llama.cpp chat history format
 */
export function convertToLlamaChatHistory(
  messages: ChatMessage[]
): Array<{ type: "user"; text: string } | { type: "model"; response: string[] }> {
  return messages.map((msg) => {
    if (msg.role === "user") {
      return { type: "user" as const, text: msg.content };
    } else {
      // assistant messages are "model" responses in llama.cpp
      return { type: "model" as const, response: [msg.content] };
    }
  });
}

/**
 * Applies chat history to a session
 */
export function applyChatHistory(
  session: LlamaChatSession,
  messages: ChatMessage[]
): void {
  const chatHistory = convertToLlamaChatHistory(messages);
  session.setChatHistory(chatHistory);
}

/**
 * Clears all chat history from a session
 */
export function clearChatHistory(session: LlamaChatSession): void {
  session.setChatHistory([]);
}
