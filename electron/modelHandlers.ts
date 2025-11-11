import { ipcMain, app } from "electron";
import { getModelDownloadService } from "./services/ModelDownloadService.js";
import { SettingsStorageService } from "./services/SettingsStorageService.js";
import { MODEL_CATALOG } from "../src/config/models.js";

/**
 * Register all model download and management IPC handlers
 * @returns Model download service instance
 */
export async function registerModelHandlers() {
  const modelDownloadService = getModelDownloadService(app.getPath("userData"));

  // Load settings and set custom model directory if specified
  const currentSettings = await SettingsStorageService.loadSettings();
  if (currentSettings.system.modelDirectory) {
    modelDownloadService.setCustomModelsDir(
      currentSettings.system.modelDirectory
    );
  }

  ipcMain.handle("model:download", async (_event, modelId: string) => {
    try {
      const model = MODEL_CATALOG.find((m) => m.id === modelId);
      if (!model) {
        return { success: false, error: "Model not found" };
      }

      const path = await modelDownloadService.downloadModel(model);
      return { success: true, path };
    } catch (error) {
      console.error("Failed to download model:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("model:cancel", async (_event, modelId: string) => {
    try {
      const cancelled = await modelDownloadService.cancelDownload(modelId);
      return { success: cancelled };
    } catch (error) {
      console.error("Failed to cancel download:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("model:get-progress", async (_event, modelId: string) => {
    try {
      const progress = modelDownloadService.getDownloadProgress(modelId);
      return { success: true, progress };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("model:get-active-downloads", async () => {
    try {
      const activeDownloads = modelDownloadService.getActiveDownloads();
      return activeDownloads;
    } catch (error) {
      console.error("Failed to get active downloads:", error);
      return [];
    }
  });

  ipcMain.handle("model:list-installed", async () => {
    try {
      const models = await modelDownloadService.listInstalledModels();
      return { success: true, models };
    } catch (error) {
      console.error("Failed to list installed models:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("model:is-installed", async (_event, modelId: string) => {
    try {
      const model = MODEL_CATALOG.find((m) => m.id === modelId);
      if (!model) {
        return { success: false, error: "Model not found" };
      }

      const installed = await modelDownloadService.isModelInstalled(model);
      return { success: true, installed };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("model:delete", async (_event, modelId: string) => {
    try {
      const model = MODEL_CATALOG.find((m) => m.id === modelId);
      if (!model) {
        return { success: false, error: "Model not found" };
      }

      const deleted = await modelDownloadService.deleteModel(model);
      return { success: deleted };
    } catch (error) {
      console.error("Failed to delete model:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("model:get-disk-space", async () => {
    try {
      const bytes = await modelDownloadService.getTotalDiskSpace();
      return { success: true, bytes };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  return modelDownloadService;
}
