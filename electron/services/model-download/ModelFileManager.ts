import fs from "fs/promises";
import {
  MODEL_CATALOG,
  type ModelMetadata,
} from "../../../src/config/models.js";
import {
  findGgufFiles,
  findInstalledFiles,
} from "../../../src/services/modelFiles.js";

export interface ModelFileManagerDeps {
  /** Moves a file to the Recycle Bin (Electron's shell.trashItem) */
  trash: (target: string) => Promise<void>;
}

/**
 * Manages model file operations (checking, listing, deleting).
 *
 * Library models are found by file name anywhere below the models folder,
 * so a folder shared with LM Studio or arranged by hand works as-is.
 */
export class ModelFileManager {
  constructor(
    private getModelsDir: () => string,
    private deps: ModelFileManagerDeps
  ) {}

  private scan(): Promise<string[]> {
    return findGgufFiles(this.getModelsDir());
  }

  /**
   * Check if a model is installed (any of its quantizations)
   */
  async isModelInstalled(model: ModelMetadata): Promise<boolean> {
    return findInstalledFiles(model, await this.scan()).length > 0;
  }

  /**
   * IDs of the library models with at least one file on disk. One scan of
   * the folder for the whole library.
   */
  async listInstalledModels(): Promise<string[]> {
    const paths = await this.scan();
    return MODEL_CATALOG.filter(
      (model) => findInstalledFiles(model, paths).length > 0
    ).map((model) => model.id);
  }

  /**
   * Move every installed file of a model to the Recycle Bin. The folder may
   * be shared with other tools, so nothing is erased outright.
   */
  async deleteModel(model: ModelMetadata): Promise<boolean> {
    const installed = findInstalledFiles(model, await this.scan());
    if (installed.length === 0) {
      console.warn(
        `[ModelFileManager] No matching file found for model ${model.id}`
      );
      return false;
    }

    for (const { path } of installed) {
      await this.deps.trash(path);
      console.log(`[ModelFileManager] Moved to Recycle Bin: ${path}`);
    }
    return true;
  }

  /**
   * Disk space used by library models
   */
  async getTotalDiskSpace(): Promise<number> {
    const paths = await this.scan();
    let totalSize = 0;
    for (const model of MODEL_CATALOG) {
      for (const { path } of findInstalledFiles(model, paths)) {
        try {
          totalSize += (await fs.stat(path)).size;
        } catch {
          // Removed since the scan
        }
      }
    }
    return totalSize;
  }
}
