import { ipcMain } from "electron";
import { SettingsStorageService } from "./services/SettingsStorageService.js";
import { getModelDownloadService } from "./services/ModelDownloadService.js";
import { getLlamaService } from "../src/services/LlamaService.js";

/**
 * Register all settings persistence IPC handlers
 * @param modelDownloadService - Model download service instance
 */
export function registerSettingsHandlers(
  modelDownloadService: ReturnType<typeof getModelDownloadService>
) {
  const llamaService = getLlamaService();

  // Settings persistence handlers
  ipcMain.handle("settings:load", async () => {
    try {
      return await SettingsStorageService.loadSettings();
    } catch (error) {
      console.error("Failed to load settings:", error);
      return SettingsStorageService.getDefaults();
    }
  });

  ipcMain.handle("settings:save", async (_event, settings) => {
    try {
      const result = await SettingsStorageService.saveSettings(settings);

      // Update services if modelDirectory changed
      if (result) {
        modelDownloadService.setCustomModelsDir(settings.system.modelDirectory);
        llamaService.setCustomModelsDir(settings.system.modelDirectory);
      }

      return result;
    } catch (error) {
      console.error("Failed to save settings:", error);
      return false;
    }
  });

  ipcMain.handle("settings:export", async (_event, settings) => {
    try {
      return await SettingsStorageService.exportSettings(settings);
    } catch (error) {
      console.error("Failed to export settings:", error);
      return null;
    }
  });

  ipcMain.handle("settings:import", async () => {
    try {
      return await SettingsStorageService.importSettings();
    } catch (error) {
      console.error("Failed to import settings:", error);
      return null;
    }
  });

  ipcMain.handle("settings:reset", async () => {
    try {
      return await SettingsStorageService.resetSettings();
    } catch (error) {
      console.error("Failed to reset settings:", error);
      return SettingsStorageService.getDefaults();
    }
  });
}
