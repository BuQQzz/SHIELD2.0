import { ipcMain } from "electron";
import { ConversationStorageService } from "../services/ConversationStorageService.js";
import { ExportService } from "../services/ExportService.js";

/**
 * Register all conversation management IPC handlers
 */
export function registerConversationHandlers() {
  const conversationStorage = new ConversationStorageService();

  // Save conversation
  ipcMain.handle("conversations:save", async (_event, conversation) => {
    return await conversationStorage.saveConversation(conversation);
  });

  // Load conversation
  ipcMain.handle("conversations:load", async (_event, conversationId) => {
    return await conversationStorage.loadConversation(conversationId);
  });

  // List conversations
  ipcMain.handle("conversations:list", async () => {
    return await conversationStorage.listConversations();
  });

  // Delete conversation
  ipcMain.handle("conversations:delete", async (_event, conversationId) => {
    return await conversationStorage.deleteConversation(conversationId);
  });

  // Search conversations
  ipcMain.handle("conversations:search", async (_event, query) => {
    return await conversationStorage.searchConversations(query);
  });

  // Export as JSON
  ipcMain.handle("conversation:export-json", async (_event, conversation) => {
    try {
      return await ExportService.exportAsJSON(conversation);
    } catch (error) {
      console.error("Failed to export conversation as JSON:", error);
      return false;
    }
  });

  // Export as Markdown
  ipcMain.handle(
    "conversation:export-markdown",
    async (_event, conversation) => {
      try {
        return await ExportService.exportAsMarkdown(conversation);
      } catch (error) {
        console.error("Failed to export conversation as Markdown:", error);
        return false;
      }
    }
  );

  // Import from JSON
  ipcMain.handle("conversation:import", async () => {
    try {
      return await ExportService.importFromJSON();
    } catch (error) {
      console.error("Failed to import conversation:", error);
      return null;
    }
  });
}
