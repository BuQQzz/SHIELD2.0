import { BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getWindowIconPath(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return path.join(process.cwd(), "public", "shield-logo.png");
  }

  // In production, the logo is in the resources/public folder
  return path.join(process.resourcesPath, "public", "shield-logo.png");
}

/**
 * Create the main application window
 */
export function createMainWindow(): BrowserWindow {
  // Determine preload script path
  // In both dev and prod, preload.mjs is in the same directory as main.js (dist-electron/)
  const preloadPath = path.join(__dirname, "preload.mjs");

  console.log("[main] Preload path:", preloadPath);
  console.log("[main] Preload exists:", fs.existsSync(preloadPath));

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: getWindowIconPath(),
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
    // In production, __dirname is inside app.asar/dist-electron/
    // dist folder is at app.asar/dist/
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    // Force repaint after showing
    mainWindow.webContents.invalidate();
  });

  // A crashed renderer left a blank white window with no way back but a
  // restart. It happened when llama-server's 22 GB of weights (loaded with
  // --load-mode none) used up the Windows commit limit (2026-09-24).
  // Reload, unless it keeps crashing - then a reload loop helps nobody.
  const recentCrashes: number[] = [];
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      `[main] Renderer gone: ${details.reason} (exit code ${details.exitCode})`
    );
    if (details.reason === "clean-exit" || mainWindow.isDestroyed()) return;

    const now = Date.now();
    recentCrashes.push(now);
    while (recentCrashes[0]! < now - 60_000) recentCrashes.shift();
    if (recentCrashes.length > 3) {
      console.error(
        "[main] Renderer crashed 4 times in a minute; not reloading"
      );
      return;
    }
    setTimeout(() => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.reload();
    }, 1000);
  });

  mainWindow.on("closed", () => {
    // Window reference will be cleaned up by caller
  });

  return mainWindow;
}
