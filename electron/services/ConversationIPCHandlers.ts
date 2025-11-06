import { ipcMain } from "electron";
import { ConversationStorageService } from "./ConversationStorageService.js";
import { ExportService } from "./ExportService.js";

const conversationStorage = new ConversationStorageService();

/**
 * Register all conversation management IPC handlers
 */
export function registerConversationHandlers() {
  // Conversation storage handlers
  ipcMain.handle("conversations:save", async (_event, conversation) => {
    return await conversationStorage.saveConversation(conversation);
  });

  ipcMain.handle("conversations:load", async (_event, conversationId) => {
    return await conversationStorage.loadConversation(conversationId);
  });

  ipcMain.handle("conversations:list", async () => {
    return await conversationStorage.listConversations();
  });

  ipcMain.handle("conversations:delete", async (_event, conversationId) => {
    return await conversationStorage.deleteConversation(conversationId);
  });

  ipcMain.handle("conversations:search", async (_event, query) => {
    return await conversationStorage.searchConversations(query);
  });

  // Export/Import handlers
  ipcMain.handle("conversation:export-json", async (_event, conversation) => {
    try {
      return await ExportService.exportAsJSON(conversation);
    } catch (error) {
      console.error("Failed to export conversation as JSON:", error);
      return false;
    }
  });

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

  ipcMain.handle("conversation:import", async () => {
    try {
      return await ExportService.importFromJSON();
    } catch (error) {
      console.error("Failed to import conversation:", error);
      return null;
    }
  });
}
