import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { getLlamaService } from "../src/services/LlamaService.js";
import { ConversationStorageService } from "./services/ConversationStorageService.js";
import { ExportService } from "./services/ExportService.js";
import { SettingsStorageService } from "./services/SettingsStorageService.js";
import { getWebSearchService } from "./services/WebSearchService.js";
import { getWebCacheService } from "./services/WebCacheService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable hardware acceleration color corrections
// This prevents the gradual color shift/wash-out issue
app.commandLine.appendSwitch("disable-color-correct-rendering");
app.commandLine.appendSwitch("force-color-profile", "srgb");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-software-rasterizer");

// Disable DevTools Autofill warnings
app.commandLine.appendSwitch("disable-features", "Autofill");

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
const llamaService = getLlamaService();
const conversationStorage = new ConversationStorageService();
const webSearchService = getWebSearchService();
let webCacheService: ReturnType<typeof getWebCacheService> | null = null;

/**
 * Create the main application window
 */
function createWindow() {
  // Determine preload script path
  const preloadPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, "preload.mjs")
    : path.join(__dirname, "preload.mjs");
  
  console.log("[main] Preload path:", preloadPath);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      webSecurity: true,
      backgroundThrottling: false,
      // Force software rendering to prevent GPU color issues
      offscreen: false,
    },
    show: false,
    backgroundColor: "#ffffff",
    // Additional rendering fixes
    autoHideMenuBar: true,
  });

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    
    // Open DevTools (set HIDE_DEVTOOLS=1 to suppress Autofill errors)
    if (!process.env.HIDE_DEVTOOLS) {
      mainWindow.webContents.openDevTools();
      
      // Note: Autofill.enable and Autofill.setAddresses errors are harmless
      // They occur because Chromium DevTools tries to enable the Autofill protocol
      // which isn't available in Electron. These can be safely ignored or hidden
      // by setting HIDE_DEVTOOLS=1 environment variable.
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Show window when ready to prevent flashing
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    // Force repaint after showing
    mainWindow?.webContents.invalidate();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Set up IPC handlers for LlamaService
 */
function setupIpcHandlers() {
  // Initialize llama.cpp
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
      await llamaService.loadModel(config);
      return { success: true };
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

  ipcMain.handle("conversation:export-markdown", async (_event, conversation) => {
    try {
      return await ExportService.exportAsMarkdown(conversation);
    } catch (error) {
      console.error("Failed to export conversation as Markdown:", error);
      return false;
    }
  });

  ipcMain.handle("conversation:import", async () => {
    try {
      return await ExportService.importFromJSON();
    } catch (error) {
      console.error("Failed to import conversation:", error);
      return null;
    }
  });

  // Settings persistence handlers
  ipcMain.handle("settings:load", async () => {
    try {
      return await SettingsStorageService.loadSettings();
    } catch (error) {
      console.error("Failed to load settings:", error);
      return SettingsStorageService.getDefaults();
    }
  });

  ipcMain.handle("settings:save", async (_event, settings) => {
    try {
      return await SettingsStorageService.saveSettings(settings);
    } catch (error) {
      console.error("Failed to save settings:", error);
      return false;
    }
  });

  ipcMain.handle("settings:export", async (_event, settings) => {
    try {
      return await SettingsStorageService.exportSettings(settings);
    } catch (error) {
      console.error("Failed to export settings:", error);
      return null;
    }
  });

  ipcMain.handle("settings:import", async () => {
    try {
      return await SettingsStorageService.importSettings();
    } catch (error) {
      console.error("Failed to import settings:", error);
      return null;
    }
  });

  ipcMain.handle("settings:reset", async () => {
    try {
      return await SettingsStorageService.resetSettings();
    } catch (error) {
      console.error("Failed to reset settings:", error);
      return SettingsStorageService.getDefaults();
    }
  });

  // Web Search handlers
  ipcMain.handle("web-search:initialize", async (_event, settings) => {
    try {
      // Try to initialize cache with user settings (optional - graceful failure)
      try {
        webCacheService = getWebCacheService(
          settings?.maxCacheSizeMB,
          settings?.cacheExpiryHours
        );
        await webCacheService.initialize();
        console.log("[WebSearch] Cache initialized successfully");
      } catch (cacheError) {
        console.warn("[WebSearch] Cache initialization failed (will proceed without cache):", cacheError instanceof Error ? cacheError.message : "Unknown error");
        webCacheService = null; // Disable cache
      }
      
      // Initialize search service (required)
      await webSearchService.initialize();
      return { success: true, cacheEnabled: webCacheService !== null };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:query", async (_event, query, maxResults, options) => {
    try {
      const results = await webSearchService.search(query, maxResults, options);
      return { success: true, results };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:fetch", async (_event, url, options) => {
    try {
      // Check cache first
      if (webCacheService) {
        const cached = await webCacheService.get(url);
        if (cached) {
          console.log("[WebSearch] Returning cached content for:", url);
          return { success: true, content: cached, fromCache: true };
        }
      }

      // Fetch fresh content
      const content = await webSearchService.fetchPage(url, options);

      // Store in cache
      if (webCacheService) {
        await webCacheService.set(url, content);
      }

      return { success: true, content, fromCache: false };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:cache-get", async (_event, url) => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const content = await webCacheService.get(url);
      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:cache-has", async (_event, url) => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const has = await webCacheService.has(url);
      return { success: true, has };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:cache-stats", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const stats = await webCacheService.getStats();
      return { success: true, stats };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:cache-clear", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      await webCacheService.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:cache-clear-expired", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const deletedCount = await webCacheService.clearExpired();
      return { success: true, deletedCount };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:cache-export", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const entries = await webCacheService.export();
      return { success: true, entries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("web-search:cache-delete", async (_event, url) => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      await webCacheService.delete(url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}

// App lifecycle
app.whenReady().then(() => {
  SettingsStorageService.initialize();
  setupIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  await llamaService.dispose();
  await webSearchService.dispose();
  if (webCacheService) {
    await webCacheService.dispose();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
