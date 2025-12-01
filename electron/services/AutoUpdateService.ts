import pkg from "electron-updater";
const { autoUpdater } = pkg;
import type { UpdateInfo } from "electron-updater";
import { BrowserWindow, ipcMain, app } from "electron";
import log from "electron-log";

// Configure logging for auto-updater
autoUpdater.logger = log;
// @ts-expect-error - electron-log types don't match electron-updater expectations
autoUpdater.logger.transports.file.level = "info";

// Disable auto-download - let user decide
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow: BrowserWindow | null = null;

/**
 * Initialize the auto-updater with the main window reference
 */
export function initAutoUpdater(window: BrowserWindow): void {
  mainWindow = window;

  // Check for updates on startup (with delay)
  setTimeout(() => {
    checkForUpdates();
  }, 5000);
}

/**
 * Check for available updates
 */
export async function checkForUpdates(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log.error("Error checking for updates:", error);
  }
}

/**
 * Download the available update
 */
export function downloadUpdate(): void {
  autoUpdater.downloadUpdate();
}

/**
 * Install the downloaded update and restart
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}

// Auto-updater events
autoUpdater.on("checking-for-update", () => {
  log.info("Checking for updates...");
  sendToRenderer("update-checking");
});

autoUpdater.on("update-available", (info: UpdateInfo) => {
  log.info("Update available:", info.version);
  sendToRenderer("update-available", {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
  });
});

autoUpdater.on("update-not-available", (info: UpdateInfo) => {
  log.info("No updates available. Current version:", info.version);
  sendToRenderer("update-not-available", {
    version: info.version,
  });
});

autoUpdater.on("download-progress", (progress) => {
  log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
  sendToRenderer("update-download-progress", {
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
  log.info("Update downloaded:", info.version);
  sendToRenderer("update-downloaded", {
    version: info.version,
    releaseNotes: info.releaseNotes,
  });
});

autoUpdater.on("error", (error) => {
  log.error("Auto-updater error:", error);
  sendToRenderer("update-error", {
    message: error.message,
  });
});

/**
 * Send update events to the renderer process
 */
function sendToRenderer(channel: string, data?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Register IPC handlers for auto-update
 */
export function registerAutoUpdateHandlers(): void {
  ipcMain.handle("check-for-updates", async () => {
    await checkForUpdates();
  });

  ipcMain.handle("download-update", () => {
    downloadUpdate();
  });

  ipcMain.handle("install-update", () => {
    installUpdate();
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });
}
