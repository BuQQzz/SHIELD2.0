import { app, BrowserWindow } from "electron";
import { SettingsStorageService } from "./services/SettingsStorageService.js";
import { mcpService } from "./services/MCPService.js";
import { createMainWindow } from "./setup/windowSetup.js";
import {
  createSplashWindow,
  updateSplashStatus,
  closeSplash,
} from "./setup/splashWindow.js";
import { registerLlamaHandlers } from "./ipc/llamaHandlers.js";
import { registerConversationHandlers } from "./ipc/conversationHandlers.js";
import { registerMcpHandlers } from "./ipc/mcpHandlers.js";
import { registerSearchHandlers } from "./ipc/searchHandlers.js";
import { registerSettingsHandlers } from "./ipc/settingsHandlers.js";
import { registerModelHandlers } from "./ipc/modelHandlers.js";
import { registerSystemHandlers } from "./ipc/systemHandlers.js";

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
let splashWindow: BrowserWindow | null = null;

/**
 * Set up all IPC handlers
 */
async function setupIpcHandlers() {
  // Load initial settings
  const settings = await SettingsStorageService.loadSettings();

  // Register all IPC handlers
  const llamaService = registerLlamaHandlers(mainWindow);
  registerConversationHandlers();
  await registerMcpHandlers();
  const { webSearchService, getWebCacheService } = registerSearchHandlers();
  const modelDownloadService = registerModelHandlers();
  registerSystemHandlers();

  // Apply initial settings to services
  if (settings.system.modelDirectory) {
    llamaService.setCustomModelsDir(settings.system.modelDirectory);
    modelDownloadService.setCustomModelsDir(settings.system.modelDirectory);
  }

  // Register settings handlers with callback for updates
  registerSettingsHandlers((updatedSettings) => {
    if (updatedSettings.system.modelDirectory) {
      modelDownloadService.setCustomModelsDir(
        updatedSettings.system.modelDirectory
      );
      llamaService.setCustomModelsDir(updatedSettings.system.modelDirectory);
    }
  });

  return { llamaService, webSearchService, getWebCacheService };
}

// App lifecycle
app.whenReady().then(async () => {
  // Show splash screen immediately
  splashWindow = createSplashWindow();
  updateSplashStatus(splashWindow, "Initializing SHIELD...");

  SettingsStorageService.initialize();
  updateSplashStatus(splashWindow, "Loading settings...");

  // Create window (but don't show yet)
  mainWindow = createMainWindow();

  // Set up IPC handlers with the window reference
  updateSplashStatus(splashWindow, "Setting up services...");
  const { llamaService, webSearchService, getWebCacheService } =
    await setupIpcHandlers();

  // Wait a moment for React to initialize and start model loading
  updateSplashStatus(splashWindow, "Loading AI model...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Close splash and show main window
  updateSplashStatus(splashWindow, "Ready!");
  closeSplash(splashWindow, mainWindow);
  splashWindow = null;

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });

  // Clean up on window close
  app.on("window-all-closed", async () => {
    await llamaService.dispose();
    await webSearchService.dispose();
    const webCacheService = getWebCacheService();
    if (webCacheService) {
      await webCacheService.dispose();
    }
    await mcpService.shutdown();
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
});
