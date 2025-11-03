import * as fs from "fs/promises";
import * as path from "path";
import { app } from "electron";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
}

interface ConversationMetadata {
  id: string;
  title: string;
  preview: string;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  modelId?: string;
  tags?: string[];
}

export class ConversationStorageService {
  private conversationsDir: string;

  constructor() {
    const userDataPath = app.getPath("userData");
    this.conversationsDir = path.join(userDataPath, "conversations");
    this.ensureConversationsDirectory();
  }

  private async ensureConversationsDirectory(): Promise<void> {
    try {
      await fs.access(this.conversationsDir);
    } catch {
      await fs.mkdir(this.conversationsDir, { recursive: true });
    }
  }

  async saveConversation(conversation: Conversation): Promise<{ success: boolean; error?: string }> {
    try {
      await this.ensureConversationsDirectory();
      const filePath = path.join(this.conversationsDir, `${conversation.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), "utf-8");
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to save conversation:", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  async loadConversation(conversationId: string): Promise<{ conversation?: Conversation; error?: string }> {
    try {
      const filePath = path.join(this.conversationsDir, `${conversationId}.json`);
      const data = await fs.readFile(filePath, "utf-8");
      const conversation = JSON.parse(data) as Conversation;
      
      // Convert date strings back to Date objects
      conversation.createdAt = new Date(conversation.createdAt);
      conversation.updatedAt = new Date(conversation.updatedAt);
      conversation.messages = conversation.messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
      
      return { conversation };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to load conversation:", errorMsg);
      return { error: errorMsg };
    }
  }

  async listConversations(): Promise<{ conversations: ConversationMetadata[]; error?: string }> {
    try {
      await this.ensureConversationsDirectory();
      const files = await fs.readdir(this.conversationsDir);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      const conversations: ConversationMetadata[] = [];

      for (const file of jsonFiles) {
        const filePath = path.join(this.conversationsDir, file);
        try {
          const data = await fs.readFile(filePath, "utf-8");
          const conv = JSON.parse(data) as Conversation;

          const preview =
            conv.messages.length > 0
              ? conv.messages[0].content.substring(0, 100)
              : "No messages";

          conversations.push({
            id: conv.id,
            title: conv.title,
            preview,
            messageCount: conv.messages.length,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
            modelId: conv.modelId,
            tags: conv.tags || [],
          });
        } catch (error) {
          console.error(`Failed to read conversation file ${file}:`, error);
        }
      }

      // Sort by updatedAt descending (most recent first)
      conversations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

      return { conversations };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to list conversations:", errorMsg);
      return { conversations: [], error: errorMsg };
    }
  }

  async deleteConversation(conversationId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const filePath = path.join(this.conversationsDir, `${conversationId}.json`);
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to delete conversation:", errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  async searchConversations(query: string): Promise<{ conversations: ConversationMetadata[]; error?: string }> {
    try {
      const { conversations, error } = await this.listConversations();
      if (error) return { conversations: [], error };

      const lowercaseQuery = query.toLowerCase();
      const filtered = conversations.filter(
        (conv) =>
          conv.title.toLowerCase().includes(lowercaseQuery) ||
          conv.preview.toLowerCase().includes(lowercaseQuery)
      );

      return { conversations: filtered };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("Failed to search conversations:", errorMsg);
      return { conversations: [], error: errorMsg };
    }
  }
}
