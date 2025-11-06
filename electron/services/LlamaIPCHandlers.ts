import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { llamaService } from "./SharedServiceInstances.js";

/**
 * Register all llama.cpp related IPC handlers
 */
export function registerLlamaHandlers(mainWindow: BrowserWindow | null) {
  // Initialize llama
  ipcMain.handle("llama:initialize", async () => {
    try {
      await llamaService.initialize();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Load a model
  ipcMain.handle("llama:loadModel", async (_event, config) => {
    try {
      const result = await llamaService.loadModel(config);
      return { success: true, warning: result.warning };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Send a chat message
  ipcMain.handle("llama:chat", async (_event, message, options) => {
    try {
      const response = await llamaService.chat(message, options);
      return { success: true, response };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Send a streaming chat message
  ipcMain.handle("llama:chatStreaming", async (_event, message, options) => {
    try {
      const response = await llamaService.chatStreaming(
        message,
        (token) => {
          // Send token to renderer
          mainWindow?.webContents.send("llama:token", token);
        },
        options
      );

      return { success: true, response };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get model info
  ipcMain.handle("llama:getModelInfo", async () => {
    try {
      const info = llamaService.getModelInfo();
      return { success: true, info };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Check if model is loaded
  ipcMain.handle("llama:isModelLoaded", async () => {
    try {
      const loaded = llamaService.isModelLoaded();
      return { success: true, loaded };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Clear chat history
  ipcMain.handle("llama:clearHistory", async () => {
    try {
      llamaService.clearHistory();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Set chat history
  ipcMain.handle("llama:setChatHistory", async (_event, messages) => {
    try {
      llamaService.setChatHistory(messages);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Stop generation
  ipcMain.handle("llama:stopGeneration", async () => {
    try {
      llamaService.stopGeneration();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Set system prompt
  ipcMain.handle("llama:setSystemPrompt", async (_event, prompt: string) => {
    try {
      await llamaService.applySystemPrompt(prompt);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get system prompt
  ipcMain.handle("llama:getSystemPrompt", async () => {
    try {
      const prompt = llamaService.getSystemPrompt();
      return { success: true, prompt };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Generate conversation title
  ipcMain.handle("llama:generateTitle", async (_event, userMessage: string) => {
    try {
      const title = await llamaService.generateTitle(userMessage);
      return { success: true, title };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}

/**
 * Get the llama service instance for cleanup
 */
export { llamaService };
