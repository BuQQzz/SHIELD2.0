import { app, BrowserWindow } from "electron";
import { SettingsStorageService } from "./services/SettingsStorageService.js";
import { mcpService } from "./services/MCPService.js";
import { createMainWindow } from "./services/WindowSetup.js";
import { registerLlamaHandlers, llamaService } from "./services/LlamaIPCHandlers.js";
import { registerConversationHandlers } from "./services/ConversationIPCHandlers.js";
import { registerSearchHandlers, getSearchServiceInstances } from "./services/SearchIPCHandlers.js";
import { registerMCPHandlers } from "./services/MCPIPCHandlers.js";
import { registerSettingsHandlers } from "./services/SettingsIPCHandlers.js";
import { registerModelHandlers } from "./services/ModelIPCHandlers.js";
import { registerSystemHandlers } from "./services/SystemIPCHandlers.js";

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
 * Set up all IPC handlers by delegating to handler modules
 */
async function setupIpcHandlers() {
  // Register all handler modules
  await registerSettingsHandlers();
  registerLlamaHandlers(mainWindow);
  registerConversationHandlers();
  registerSearchHandlers(mainWindow);
  registerMCPHandlers();
  registerModelHandlers();
  registerSystemHandlers();
}

// App lifecycle
app.whenReady().then(() => {
  SettingsStorageService.initialize();
  setupIpcHandlers();
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  const { webSearchService, webCacheService } = getSearchServiceInstances();
  
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
