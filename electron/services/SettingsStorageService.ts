import * as fs from "fs/promises";
import * as path from "path";
import { app } from "electron";
import { Settings, DEFAULT_SETTINGS } from "./SettingsTypes";
import { mergeWithDefaults, isValidSettings } from "./SettingsValidation";

export class SettingsStorageService {
  private static settingsDir: string;
  private static settingsPath: string;

  static initialize(): void {
    this.settingsDir = path.join(app.getPath("userData"), "settings");
    this.settingsPath = path.join(this.settingsDir, "settings.json");
    console.log("[SettingsStorage] Initialized:", this.settingsPath);
  }

  /**
   * Load settings from file
   */
  static async loadSettings(): Promise<Settings> {
    try {
      // Ensure settings directory exists
      await fs.mkdir(this.settingsDir, { recursive: true });

      // Check if settings file exists
      try {
        await fs.access(this.settingsPath);
      } catch {
        // Settings file doesn't exist, return defaults
        console.log("[SettingsStorage] No settings file found, using defaults");
        return DEFAULT_SETTINGS;
      }

      // Read and parse settings file
      const data = await fs.readFile(this.settingsPath, "utf-8");
      const settings = JSON.parse(data) as Settings;

      // Merge with defaults to handle new settings
      const mergedSettings = mergeWithDefaults(settings);

      console.log("[SettingsStorage] Settings loaded successfully");
      return mergedSettings;
    } catch (error) {
      console.error("[SettingsStorage] Failed to load settings:", error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Save settings to file
   */
  static async saveSettings(settings: Settings): Promise<boolean> {
    try {
      // Ensure settings directory exists
      await fs.mkdir(this.settingsDir, { recursive: true });

      // Write settings to file
      await fs.writeFile(
        this.settingsPath,
        JSON.stringify(settings, null, 2),
        "utf-8"
      );

      console.log("[SettingsStorage] Settings saved successfully");
      return true;
    } catch (error) {
      console.error("[SettingsStorage] Failed to save settings:", error);
      return false;
    }
  }

  /**
   * Export settings to user-selected file
   */
  static async exportSettings(settings: Settings): Promise<string | null> {
    try {
      const { dialog } = await import("electron");
      const result = await dialog.showSaveDialog({
        title: "Export Settings",
        defaultPath: `shield-settings-${new Date().toISOString().split("T")[0]}.json`,
        filters: [{ name: "JSON Files", extensions: ["json"] }],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      const exportData = {
        ...settings,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      await fs.writeFile(
        result.filePath,
        JSON.stringify(exportData, null, 2),
        "utf-8"
      );

      console.log("[SettingsStorage] Settings exported to:", result.filePath);
      return result.filePath;
    } catch (error) {
      console.error("[SettingsStorage] Failed to export settings:", error);
      return null;
    }
  }

  /**
   * Import settings from user-selected file
   */
  static async importSettings(): Promise<Settings | null> {
    try {
      const { dialog } = await import("electron");
      const result = await dialog.showOpenDialog({
        title: "Import Settings",
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        properties: ["openFile"],
      });

      if (result.canceled || !result.filePaths.length) {
        return null;
      }

      const data = await fs.readFile(result.filePaths[0], "utf-8");
      const importedData = JSON.parse(data);

      // Validate and extract settings
      if (!isValidSettings(importedData)) {
        throw new Error("Invalid settings format");
      }

      // Remove export metadata if present
      const {
        exportedAt: _exportedAt,
        version: _version,
        ...settings
      } = importedData;

      console.log("[SettingsStorage] Settings imported successfully");
      return settings as Settings;
    } catch (error) {
      console.error("[SettingsStorage] Failed to import settings:", error);
      return null;
    }
  }

  /**
   * Reset settings to defaults
   */
  static async resetSettings(): Promise<Settings> {
    try {
      await this.saveSettings(DEFAULT_SETTINGS);
      console.log("[SettingsStorage] Settings reset to defaults");
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error("[SettingsStorage] Failed to reset settings:", error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Get default settings
   */
  static getDefaults(): Settings {
    return { ...DEFAULT_SETTINGS };
  }
}
