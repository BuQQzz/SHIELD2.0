import { ipcMain, BrowserWindow } from "electron";
import { getModelRuntime } from "../../src/services/ModelRuntime.js";
import type { ToolDefinition } from "../../src/types/prompts.js";
import type { RescueAction } from "../../src/services/llamaServer/rescue.js";

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
        summary: llamaService.getLastSummary(),
        capsule: llamaService.getLastCapsule(),
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
        {
          ...options,
          // Summarising, reading and writing as they happen, for the live
          // status line and the context ring
          onProgress: (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("llama:progress", progress);
            }
          },
        }
      );

      return {
        success: true,
        response,
        stats: llamaService.getLastStats(),
        context: await llamaService.getContextUsage(),
        summary: llamaService.getLastSummary(),
        capsule: llamaService.getLastCapsule(),
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

  // The sampling a library model's file (or SHIELD's catalog) recommends
  ipcMain.handle(
    "llama:getRecommendedSampling",
    async (_event, modelId: string) => {
      try {
        return {
          success: true,
          sampling: await llamaService.getRecommendedSampling(modelId),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

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

  // A request that looks stuck: how long it has run, and what to do about it
  ipcMain.handle("llama:requestStatus", async () => ({
    success: true,
    status: llamaService.requestStatus(),
  }));

  ipcMain.handle("llama:rescue", async (_event, action: RescueAction) => {
    if (!["nudge", "skip", "restart"].includes(action)) {
      return { success: false, error: `Unknown action ${String(action)}` };
    }
    return { success: true, cutOff: llamaService.rescue(action) };
  });

  // Sub-agent sessions: a chat of their own on the loaded llama-server model
  const failure = (error: unknown) => ({
    success: false,
    error: error instanceof Error ? error.message : "Unknown error",
  });

  ipcMain.handle("llama:agentOpen", async (_event, systemPrompt: string) => {
    try {
      return {
        success: true,
        sessionId: llamaService.createAgentSession(systemPrompt),
      };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle(
    "llama:agentChat",
    async (_event, sessionId: string, message: string, options) => {
      try {
        const response = await llamaService.agentChat(sessionId, message, {
          ...options,
          // Streamed to the Team panel, tagged with the session it belongs to
          onToken: (token: string) => {
            const mainWindow = getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("llama:agentToken", {
                sessionId,
                token,
              });
            }
          },
        });
        return { success: true, response };
      } catch (error) {
        return failure(error);
      }
    }
  );

  ipcMain.handle("llama:agentContext", async (_event, sessionId: string) => {
    try {
      return { success: true, ...llamaService.getAgentContext(sessionId) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle("llama:agentClose", async (_event, sessionId: string) => {
    try {
      llamaService.closeAgentSession(sessionId);
      return { success: true };
    } catch (error) {
      return failure(error);
    }
  });

  // Set system prompt
  ipcMain.handle(
    "llama:setSystemPrompt",
    async (_event, prompt: string, tools?: ToolDefinition[]) => {
      try {
        await llamaService.applySystemPrompt(prompt, tools);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

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
