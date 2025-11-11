import { LlamaContext, LlamaChatSession } from "node-llama-cpp";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Manages chat sessions and history
 * Handles system prompt application and chat history operations
 */
export class SessionManager {
  private systemPrompt: string = "You are a helpful AI assistant.";

  /**
   * Create a new chat session with the current system prompt
   */
  createSession(context: LlamaContext): LlamaChatSession {
    return new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: this.systemPrompt,
    });
  }

  /**
   * Set the system prompt
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Recreate a session with a new system prompt while preserving chat history
   */
  recreateSessionWithPrompt(
    context: LlamaContext,
    currentSession: LlamaChatSession | null,
    newPrompt: string
  ): LlamaChatSession {
    this.systemPrompt = newPrompt;

    // Save current chat history if session exists
    const currentHistory = currentSession?.getChatHistory();

    // Create new session with new system prompt
    const newSession = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: this.systemPrompt,
    });

    // Restore chat history if it exists
    if (currentHistory && currentHistory.length > 0) {
      newSession.setChatHistory(currentHistory);
    }

    return newSession;
  }

  /**
   * Set chat history from saved conversation
   */
  setChatHistory(session: LlamaChatSession, messages: ChatMessage[]): void {
    // Convert our ChatMessage format to LlamaChatSession format
    const chatHistory = messages.map((msg) => {
      if (msg.role === "user") {
        return { type: "user" as const, text: msg.content };
      } else {
        // assistant messages are "model" responses in llama.cpp
        return { type: "model" as const, response: [msg.content] };
      }
    });
    session.setChatHistory(chatHistory);
  }

  /**
   * Clear chat history
   */
  clearHistory(session: LlamaChatSession): void {
    session.setChatHistory([]);
  }
}
