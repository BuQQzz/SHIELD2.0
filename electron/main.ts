import { app, BrowserWindow } from "electron";
import { SettingsStorageService } from "./services/SettingsStorageService.js";
import { createWindow } from "./windowSetup.js";
import { registerLlamaHandlers, getLlamaServiceInstance } from "./llamaHandlers.js";
import { registerConversationHandlers } from "./conversationHandlers.js";
import { registerMCPHandlers, getMCPServiceInstance } from "./mcpHandlers.js";
import { registerSearchHandlers, getWebSearchServiceInstances } from "./searchHandlers.js";
import { registerSettingsHandlers } from "./settingsHandlers.js";
import { registerModelHandlers } from "./modelHandlers.js";
import { registerSystemHandlers } from "./systemHandlers.js";

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

/**
 * Create the main application window
 */
function createMainWindow() {
  mainWindow = createWindow();
  
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/**
 * Set up all IPC handlers by registering modular handler groups
 */
async function setupIpcHandlers() {
  // Register all handler modules
  await registerLlamaHandlers(mainWindow);
  registerConversationHandlers();
  await registerMCPHandlers();
  registerSearchHandlers();
  
  // Register model handlers and get the service instance for settings
  const modelDownloadService = await registerModelHandlers();
  
  // Register settings handlers (needs model download service)
  registerSettingsHandlers(modelDownloadService);
  
  // Register system handlers
  registerSystemHandlers();
}

// App lifecycle
app.whenReady().then(async () => {
  SettingsStorageService.initialize();
  await setupIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  // Clean up services
  const llamaService = getLlamaServiceInstance();
  const mcpService = getMCPServiceInstance();
  const { webSearchService, webCacheService } = getWebSearchServiceInstances();
  
  await llamaService.dispose();
  await webSearchService.dispose();
  if (webCacheService) {
    await webCacheService.dispose();
  }
  await mcpService.shutdown();
  
  if (process.platform !== "darwin") {
    app.quit();
  }
});
