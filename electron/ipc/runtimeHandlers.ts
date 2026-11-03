import { app, ipcMain, type BrowserWindow } from "electron";
import path from "path";
import {
  locateLlamaServer,
  setManagedServerLookup,
} from "../../src/services/llamaServer/launch.js";
import type { RuntimeStatus, RuntimeVariant } from "../../src/types/runtime.js";
import { TESTED_TAG } from "../services/runtime/runtimeAssets.js";
import { RuntimeManager } from "../services/runtime/RuntimeManager.js";

const failure = (error: unknown) => ({
  success: false as const,
  error: error instanceof Error ? error.message : "Unknown error",
});

/**
 * The llama-server runtime (Settings › Runtime): what a model load would
 * start, the newest Prism build, install with progress, cancel, rollback.
 */
export function registerRuntimeHandlers(
  getMainWindow: () => BrowserWindow | null
): RuntimeManager {
  const manager = new RuntimeManager(
    path.join(app.getPath("userData"), "runtime")
  );
  setManagedServerLookup(() => manager.activeBinary());

  ipcMain.handle("runtime:status", async () => {
    try {
      const found = locateLlamaServer();
      const status: RuntimeStatus = {
        source: found?.source ?? "none",
        binary: found?.binary,
        ...manager.installed(),
        recommendedVariant: await manager.recommendedVariant(),
        testedTag: TESTED_TAG,
      };
      return { success: true, status };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle("runtime:latest", async (_event, variant: RuntimeVariant) => {
    try {
      return { success: true, release: await manager.latest(variant) };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle("runtime:install", async (_event, variant: RuntimeVariant) => {
    try {
      const runtime = await manager.install(variant, (progress) =>
        getMainWindow()?.webContents.send("runtime:progress", progress)
      );
      return { success: true, runtime };
    } catch (error) {
      return failure(error);
    }
  });

  ipcMain.handle("runtime:cancel", () => {
    manager.cancel();
    return { success: true };
  });

  ipcMain.handle("runtime:rollback", () => {
    try {
      return { success: true, runtime: manager.rollback() };
    } catch (error) {
      return failure(error);
    }
  });

  return manager;
}
