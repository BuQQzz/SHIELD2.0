import { ipcMain } from "electron";
import { SettingsStorageService } from "../services/SettingsStorageService.js";
import type { Settings } from "../services/settings/SettingsCategories.js";

/**
 * Register all settings persistence IPC handlers
 */
export function registerSettingsHandlers(
  onSettingsChanged: (settings: Settings) => void
) {
  // Load settings
  ipcMain.handle("settings:load", async () => {
    try {
      return await SettingsStorageService.loadSettings();
    } catch (error) {
      console.error("Failed to load settings:", error);
      return SettingsStorageService.getDefaults();
    }
  });

  // Save settings
  ipcMain.handle("settings:save", async (_event, settings) => {
    try {
      const result = await SettingsStorageService.saveSettings(settings);

      // Notify about settings change
      if (result) {
        onSettingsChanged(settings);
      }

      return result;
    } catch (error) {
      console.error("Failed to save settings:", error);
      return false;
    }
  });

  // Export settings
  ipcMain.handle("settings:export", async (_event, settings) => {
    try {
      return await SettingsStorageService.exportSettings(settings);
    } catch (error) {
      console.error("Failed to export settings:", error);
      return null;
    }
  });

  // Import settings
  ipcMain.handle("settings:import", async () => {
    try {
      return await SettingsStorageService.importSettings();
    } catch (error) {
      console.error("Failed to import settings:", error);
      return null;
    }
  });

  // Reset settings
  ipcMain.handle("settings:reset", async () => {
    try {
      return await SettingsStorageService.resetSettings();
    } catch (error) {
      console.error("Failed to reset settings:", error);
      return SettingsStorageService.getDefaults();
    }
  });
}
