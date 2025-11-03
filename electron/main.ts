import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { getLlamaService } from "../src/services/LlamaService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable hardware acceleration color corrections
// This prevents the gradual color shift/wash-out issue
app.commandLine.appendSwitch("disable-color-correct-rendering");
app.commandLine.appendSwitch("force-color-profile", "srgb");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-software-rasterizer");

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
const llamaService = getLlamaService();

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
    mainWindow.webContents.openDevTools();
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
      let fullResponse = "";

      const response = await llamaService.chatStreaming(
        message,
        (token) => {
          fullResponse += token;
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
}

// App lifecycle
app.whenReady().then(() => {
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
