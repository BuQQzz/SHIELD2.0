import path from "path";
import { app, BrowserWindow } from "electron";
import { SettingsStorageService } from "./services/SettingsStorageService.js";
import { mcpService } from "./services/MCPService.js";
import { createMainWindow } from "./setup/windowSetup.js";
import { registerLlamaHandlers } from "./ipc/llamaHandlers.js";
import { registerConversationHandlers } from "./ipc/conversationHandlers.js";
import { registerMcpHandlers } from "./ipc/mcpHandlers.js";
import { registerSearchHandlers } from "./ipc/searchHandlers.js";
import { registerSettingsHandlers } from "./ipc/settingsHandlers.js";
import { registerModelHandlers } from "./ipc/modelHandlers.js";
import { registerSystemHandlers } from "./ipc/systemHandlers.js";
import {
  initAutoUpdater,
  registerAutoUpdateHandlers,
} from "./services/AutoUpdateService.js";

// Disable hardware acceleration color corrections
// This prevents the gradual color shift/wash-out issue
app.commandLine.appendSwitch("disable-color-correct-rendering");
app.commandLine.appendSwitch("force-color-profile", "srgb");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-software-rasterizer");

// Disable DevTools Autofill warnings
app.commandLine.appendSwitch("disable-features", "Autofill");

// Global error handlers
process.on("uncaughtException", (error) => {
  console.error("[main] Uncaught exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("[main] Unhandled rejection:", reason);
});

// Keep a global reference to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaService: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let webSearchService: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getWebCacheService: any = null;

/**
 * Set up all IPC handlers
 */
async function setupIpcHandlers() {
  // Load initial settings
  const settings = await SettingsStorageService.loadSettings();

  // Register all IPC handlers
  // Pass a getter function for mainWindow so handlers can access it after it's created
  const llamaService = registerLlamaHandlers(() => mainWindow);
  registerConversationHandlers();
  await registerMcpHandlers();
  const { webSearchService, getWebCacheService } = registerSearchHandlers();
  const modelDownloadService = registerModelHandlers();
  registerSystemHandlers();

  // Apply initial settings to services. The model loader gets the download
  // folder even without a custom one - its own default was a different
  // folder, so downloaded models could not be loaded.
  llamaService.setCustomModelsDir(
    settings.system.modelDirectory ||
      path.join(app.getPath("userData"), "models")
  );
  if (settings.system.modelDirectory) {
    modelDownloadService.setCustomModelsDir(settings.system.modelDirectory);
  }

  // Before the renderer initialises MCP, so the filesystem server starts
  // with the saved folder rather than restarting straight after launch
  if (settings.mcp?.workspaceFolder) {
    await mcpService.setWorkspaceFolder(settings.mcp.workspaceFolder);
  }

  // Apply HuggingFace token if configured
  if (settings.system.huggingFaceToken) {
    modelDownloadService.setHuggingFaceToken(settings.system.huggingFaceToken);
  }

  // Register settings handlers with callback for updates
  registerSettingsHandlers((updatedSettings) => {
    if (updatedSettings.system.modelDirectory) {
      modelDownloadService.setCustomModelsDir(
        updatedSettings.system.modelDirectory
      );
      llamaService.setCustomModelsDir(updatedSettings.system.modelDirectory);
    }
    // Update HuggingFace token when settings change
    modelDownloadService.setHuggingFaceToken(
      updatedSettings.system.huggingFaceToken
    );
    // Keeps settings the source of truth (e.g. an imported or reset settings
    // file). A no-op when the folder chip already applied the same folder.
    mcpService
      .setWorkspaceFolder(updatedSettings.mcp?.workspaceFolder ?? null)
      .catch((error) =>
        console.error("[main] Failed to apply workspace folder:", error)
      );
  });

  return {
    llamaService,
    webSearchService,
    getWebCacheService,
    modelDownloadService,
  };
}

// Register app lifecycle events BEFORE whenReady
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow();
  }
});

// Clean up on window close
app.on("window-all-closed", async () => {
  if (llamaService) {
    await llamaService.dispose();
  }
  if (webSearchService) {
    await webSearchService.dispose();
  }
  if (getWebCacheService) {
    const webCacheService = getWebCacheService();
    if (webCacheService) {
      await webCacheService.dispose();
    }
  }
  await mcpService.shutdown();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// App lifecycle
app.whenReady().then(async () => {
  try {
    // KNOWN ISSUE: Splash screen causes app to crash on Windows
    // When splash.show() is called, the Electron process terminates immediately
    // This appears to be a bug with vite-plugin-electron or Electron itself
    // Splash screen is disabled until this can be resolved

    SettingsStorageService.initialize();

    // IMPORTANT: Register IPC handlers BEFORE creating the window
    // This ensures handlers are ready when React tries to call them
    const services = await setupIpcHandlers();
    llamaService = services.llamaService;
    webSearchService = services.webSearchService;
    getWebCacheService = services.getWebCacheService;

    // Create window (but don't show yet)
    mainWindow = createMainWindow();

    // Set main window for model download service (required for progress updates)
    if (services.modelDownloadService) {
      services.modelDownloadService.setMainWindow(mainWindow);
    }

    // Wait for the page to finish loading
    await new Promise<void>((resolve) => {
      mainWindow!.webContents.once("did-finish-load", () => {
        resolve();
      });
      mainWindow!.webContents.once("did-fail-load", () => {
        resolve(); // Continue anyway
      });
    });

    // Wait briefly for React to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Initialize auto-updater (only in production)
    if (!process.env.VITE_DEV_SERVER_URL) {
      registerAutoUpdateHandlers();
      initAutoUpdater(mainWindow);
    }

    // Show main window
    mainWindow.show();
  } catch (error) {
    console.error("[main] Error during app initialization:", error);
    app.quit();
  }
});
