import * as fs from "fs/promises";
import * as path from "path";
import { app } from "electron";

interface Settings {
  model: {
    temperature: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
    contextLength: number;
    maxTokens: number;
  };
  system: {
    systemPrompt: string;
    autoSave: boolean;
    confirmDelete: boolean;
    theme: "light" | "dark" | "system";
  };
  privacy: {
    telemetry: boolean;
    analytics: boolean;
  };
  webSearch: {
    enabled: boolean;
    maxResults: number;
    cacheEnabled: boolean;
    cacheTTL: number;
    provider: "duckduckgo";
  };
}

const DEFAULT_SETTINGS: Settings = {
  model: {
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    repeatPenalty: 1.1,
    contextLength: 4096,
    maxTokens: 2048,
  },
  system: {
    systemPrompt: "You are a helpful AI assistant.",
    autoSave: true,
    confirmDelete: true,
    theme: "system",
  },
  privacy: {
    telemetry: false,
    analytics: false,
  },
  webSearch: {
    enabled: false,
    maxResults: 5,
    cacheEnabled: true,
    cacheTTL: 1440,
    provider: "duckduckgo",
  },
};

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
      const mergedSettings = this.mergeWithDefaults(settings);

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
      if (!this.isValidSettings(importedData)) {
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

  /**
   * Merge user settings with defaults (handles new settings)
   */
  private static mergeWithDefaults(settings: Partial<Settings>): Settings {
    return {
      model: {
        ...DEFAULT_SETTINGS.model,
        ...settings.model,
      },
      system: {
        ...DEFAULT_SETTINGS.system,
        ...settings.system,
      },
      privacy: {
        ...DEFAULT_SETTINGS.privacy,
        ...settings.privacy,
      },
      webSearch: {
        ...DEFAULT_SETTINGS.webSearch,
        ...settings.webSearch,
      },
    };
  }

  /**
   * Validate settings structure
   */
  private static isValidSettings(data: unknown): boolean {
    if (!data || typeof data !== "object") return false;

    const obj = data as Record<string, unknown>;

    // Check model settings
    if (!obj.model || typeof obj.model !== "object") return false;
    const model = obj.model as Record<string, unknown>;
    if (
      typeof model.temperature !== "number" ||
      typeof model.topP !== "number" ||
      typeof model.topK !== "number" ||
      typeof model.repeatPenalty !== "number" ||
      typeof model.contextLength !== "number" ||
      typeof model.maxTokens !== "number"
    ) {
      return false;
    }

    // Check system settings
    if (!obj.system || typeof obj.system !== "object") return false;
    const system = obj.system as Record<string, unknown>;
    if (
      typeof system.systemPrompt !== "string" ||
      typeof system.autoSave !== "boolean" ||
      typeof system.confirmDelete !== "boolean" ||
      !system.theme ||
      !["light", "dark", "system"].includes(system.theme as string)
    ) {
      return false;
    }

    // Check privacy settings
    if (!obj.privacy || typeof obj.privacy !== "object") return false;
    const privacy = obj.privacy as Record<string, unknown>;
    if (
      typeof privacy.telemetry !== "boolean" ||
      typeof privacy.analytics !== "boolean"
    ) {
      return false;
    }

    // Check webSearch settings (optional for backward compatibility)
    if (obj.webSearch) {
      if (typeof obj.webSearch !== "object") return false;
      const webSearch = obj.webSearch as Record<string, unknown>;
      if (
        typeof webSearch.enabled !== "boolean" ||
        typeof webSearch.maxResults !== "number" ||
        typeof webSearch.cacheEnabled !== "boolean" ||
        typeof webSearch.cacheTTL !== "number" ||
        webSearch.provider !== "duckduckgo"
      ) {
        return false;
      }
    }

    return true;
  }
}
