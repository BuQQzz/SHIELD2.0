import { ipcMain, app } from "electron";
import { getModelDownloadService } from "../services/ModelDownloadService.js";
import { MODEL_CATALOG } from "../../src/config/models.js";

/**
 * Register all model download related IPC handlers
 */
export function registerModelHandlers() {
  const modelDownloadService = getModelDownloadService(app.getPath("userData"));

  // Download model
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

  // Cancel download
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

  // Get download progress
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

  // Get active downloads
  ipcMain.handle("model:get-active-downloads", async () => {
    try {
      const activeDownloads = modelDownloadService.getActiveDownloads();
      return activeDownloads;
    } catch (error) {
      console.error("Failed to get active downloads:", error);
      return [];
    }
  });

  // List installed models - returns model IDs from catalog that are installed
  ipcMain.handle("model:list-installed", async () => {
    try {
      // Check each model in the catalog to see if it's installed
      const installedModelIds: string[] = [];
      for (const model of MODEL_CATALOG) {
        const isInstalled = await modelDownloadService.isModelInstalled(model);
        if (isInstalled) {
          installedModelIds.push(model.id);
        }
      }
      console.log(`[modelHandlers] Found ${installedModelIds.length} installed models:`, installedModelIds);
      return { success: true, models: installedModelIds };
    } catch (error) {
      console.error("Failed to list installed models:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Check if model is installed
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

  // Delete model
  ipcMain.handle("model:delete", async (_event, modelId: string) => {
    try {
      const model = MODEL_CATALOG.find((m) => m.id === modelId);
      if (!model) {
        return { success: false, error: "Model not found in catalog" };
      }

      const deleted = await modelDownloadService.deleteModel(model);
      if (!deleted) {
        return { success: false, error: "Model file not found or could not be deleted" };
      }
      return { success: true };
    } catch (error) {
      console.error("Failed to delete model:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get disk space
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

  // Set HuggingFace token for authenticated downloads
  ipcMain.handle(
    "model:set-hf-token",
    async (_event, token: string | undefined) => {
      try {
        modelDownloadService.setHuggingFaceToken(token);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  return modelDownloadService;
}
