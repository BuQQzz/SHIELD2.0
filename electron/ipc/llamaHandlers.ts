import { ipcMain, BrowserWindow } from "electron";
import { getModelRuntime } from "../../src/services/ModelRuntime.js";

/**
 * Register all Llama.cpp related IPC handlers
 * @param getMainWindow - Getter function that returns the current main window
 */
export function registerLlamaHandlers(
  getMainWindow: () => BrowserWindow | null
) {
  // Routes each model to node-llama-cpp or a SHIELD-managed llama-server
  const llamaService = getModelRuntime();

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
      // Held back for lack of memory: the renderer asks the user
      if (result.memory) return { success: false, memory: result.memory };
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
      return {
        success: true,
        response,
        stats: llamaService.getLastStats(),
        context: await llamaService.getContextUsage(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Send a streaming chat message
  ipcMain.handle("llama:chatStreaming", async (_event, message, options) => {
    console.log(
      "[IPC] chatStreaming called with message:",
      message.substring(0, 50)
    );
    console.log("[IPC] Options:", JSON.stringify(options));

    try {
      const mainWindow = getMainWindow();
      console.log("[IPC] mainWindow exists:", !!mainWindow);

      const response = await llamaService.chatStreaming(
        message,
        (token) => {
          // The page that asked is gone (renderer crash): stop generating
          // instead of logging a send error for each of up to 8k tokens
          if (mainWindow && mainWindow.webContents.isCrashed()) {
            llamaService.stopGeneration();
            return;
          }
          // Send token to renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("llama:token", token);
          }
        },
        options
      );

      return {
        success: true,
        response,
        stats: llamaService.getLastStats(),
        context: await llamaService.getContextUsage(),
      };
    } catch (error) {
      console.error("[IPC] chatStreaming error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // How full the context window is, for the composer's context ring
  ipcMain.handle("llama:getContextUsage", async () => {
    return { success: true, context: await llamaService.getContextUsage() };
  });

  // What is filling the context window, for the context panel
  ipcMain.handle("llama:getContextBreakdown", async () => {
    try {
      return {
        success: true,
        breakdown: await llamaService.getContextBreakdown(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Context sizes for a library model and how much stays on the GPU
  ipcMain.handle("llama:getContextPlan", async (_event, modelId: string) => {
    try {
      return {
        success: true,
        plan: await llamaService.getContextPlan(modelId),
      };
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

  return llamaService;
}
