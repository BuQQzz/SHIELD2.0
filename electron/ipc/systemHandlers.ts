import { ipcMain, dialog, shell } from "electron";

/**
 * Register all system-level IPC handlers
 */
export function registerSystemHandlers() {
  // Select directory dialog
  ipcMain.handle("system:select-directory", async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "Select Model Directory",
        message: "Choose where to store downloaded models",
      });

      if (result.canceled || !result.filePaths.length) {
        return null;
      }

      return result.filePaths[0];
    } catch (error) {
      console.error("Failed to select directory:", error);
      return null;
    }
  });

  // Open external URL in default browser
  ipcMain.handle("system:open-external", async (_event, url: string) => {
    try {
      // Validate URL to prevent security issues
      const urlObj = new URL(url);
      const allowedProtocols = ["http:", "https:"];

      if (!allowedProtocols.includes(urlObj.protocol)) {
        console.error("Invalid protocol:", urlObj.protocol);
        return {
          success: false,
          error: "Only HTTP and HTTPS URLs are allowed",
        };
      }

      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error("Failed to open external URL:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
