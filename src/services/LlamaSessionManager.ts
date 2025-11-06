import { LlamaContext, LlamaChatSession } from "node-llama-cpp";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Manages chat sessions for llama.cpp
 * Handles session creation, system prompts, and chat history management
 */
export class LlamaSessionManager {
  private session: LlamaChatSession | null = null;
  private systemPrompt: string = "You are a helpful AI assistant.";

  /**
   * Create a new chat session with the given context
   */
  createSession(context: LlamaContext): void {
    this.session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      systemPrompt: this.systemPrompt,
    });
  }

  /**
   * Set the system prompt
   * If a session exists, recreates it with the new prompt while preserving chat history
   */
  setSystemPrompt(prompt: string, context: LlamaContext | null): void {
    this.systemPrompt = prompt;

    // Apply immediately if we have an active session
    if (context && this.session) {
      // Save current chat history
      const currentHistory = this.session.getChatHistory();

      // Recreate session with new system prompt
      this.session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: this.systemPrompt,
      });

      // Restore chat history
      if (currentHistory && currentHistory.length > 0) {
        this.session.setChatHistory(currentHistory);
      }
    }
  }

  /**
   * Get the current system prompt
   */
  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Get the current session
   */
  getSession(): LlamaChatSession | null {
    return this.session;
  }

  /**
   * Set chat history from saved conversation
   */
  setChatHistory(messages: ChatMessage[]): void {
    if (this.session) {
      // Convert our ChatMessage format to LlamaChatSession format
      const chatHistory = messages.map((msg) => {
        if (msg.role === "user") {
          return { type: "user" as const, text: msg.content };
        } else {
          // assistant messages are "model" responses in llama.cpp
          return { type: "model" as const, response: [msg.content] };
        }
      });
      this.session.setChatHistory(chatHistory);
    }
  }

  /**
   * Clear chat history
   */
  clearHistory(): void {
    if (this.session) {
      this.session.setChatHistory([]);
    }
  }

  /**
   * Clear the session
   */
  clearSession(): void {
    this.session = null;
  }
}
