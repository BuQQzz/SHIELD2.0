import { app } from "electron";
import * as path from "path";
import * as fs from "fs/promises";

interface AppSettings {
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
  };
  privacy: {
    telemetry: boolean;
    analytics: boolean;
  };
}

class SettingsService {
  private settingsPath: string;

  constructor() {
    const userDataPath = app.getPath("userData");
    this.settingsPath = path.join(userDataPath, "settings.json");
  }

  async load(): Promise<AppSettings | null> {
    try {
      const data = await fs.readFile(this.settingsPath, "utf-8");
      return JSON.parse(data);
    } catch {
      // Return null if file doesn't exist or can't be read
      return null;
    }
  }

  async save(settings: AppSettings): Promise<void> {
    await fs.writeFile(
      this.settingsPath,
      JSON.stringify(settings, null, 2),
      "utf-8"
    );
  }
}

export const settingsService = new SettingsService();
