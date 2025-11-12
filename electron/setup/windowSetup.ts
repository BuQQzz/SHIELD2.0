import { BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create the main application window
 */
export function createMainWindow(): BrowserWindow {
  // Determine preload script path
  const preloadPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, "../preload.mjs")
    : path.join(__dirname, "../preload.mjs");

  console.log("[main] Preload path:", preloadPath);

  const mainWindow = new BrowserWindow({
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
    mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  // Show window when ready to prevent flashing
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    // Force repaint after showing
    mainWindow.webContents.invalidate();
  });

  mainWindow.on("closed", () => {
    // Window reference will be cleaned up by caller
  });

  return mainWindow;
}
