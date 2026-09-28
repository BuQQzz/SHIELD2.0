import { app, ipcMain } from "electron";
import path from "path";
import { ConversationStorageService } from "../services/ConversationStorageService.js";
import {
  ProjectStorageService,
  type Project,
} from "../services/ProjectStorageService.js";
import type { MemoryConversation } from "../services/memory/memoryEntries.js";
import { indexConversation } from "./memoryHandlers.js";

/** Projects, and moving conversations in and out of them */
export function registerProjectHandlers(): void {
  const projects = new ProjectStorageService(
    path.join(app.getPath("userData"), "projects.json")
  );
  const conversations = new ConversationStorageService();

  ipcMain.handle("projects:list", async () => ({
    projects: await projects.list(),
  }));

  ipcMain.handle("projects:save", async (_event, project: Project) => {
    try {
      if (!project?.id || !project.name?.trim()) {
        return { success: false, error: "A project needs an id and a name" };
      }
      return { success: true, project: await projects.save(project) };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // The project goes; its conversations stay, outside any project
  ipcMain.handle("projects:delete", async (_event, projectId: string) => {
    try {
      const moved = await conversations.clearProject(projectId);
      await projects.remove(projectId);
      for (const id of moved) {
        const { conversation } = await conversations.loadConversation(id);
        if (conversation) {
          indexConversation(conversation as unknown as MemoryConversation);
        }
      }
      return { success: true, moved: moved.length };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  ipcMain.handle(
    "conversations:set-project",
    async (_event, conversationId: string, projectId: string | null) => {
      const result = await conversations.setProject(conversationId, projectId);
      if (result.conversation) {
        indexConversation(result.conversation as unknown as MemoryConversation);
      }
      return { success: result.success, error: result.error };
    }
  );
}
