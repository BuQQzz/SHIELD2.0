import { ipcMain, dialog } from "electron";

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
}
