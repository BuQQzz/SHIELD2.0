import { create } from "zustand";
import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";

interface SettingsStore {
  settings: AppSettings;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  exportSettings: () => Promise<string | null>;
  importSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const savedSettings = await window.electronAPI.settingsPersistence.load();
      if (savedSettings) {
        set({ settings: savedSettings });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  updateSettings: async (newSettings: Partial<AppSettings>) => {
    const currentSettings = get().settings;
    const updatedSettings = {
      ...currentSettings,
      ...newSettings,
      model: { ...currentSettings.model, ...newSettings.model },
      system: { ...currentSettings.system, ...newSettings.system },
      privacy: { ...currentSettings.privacy, ...newSettings.privacy },
      webSearch: { ...currentSettings.webSearch, ...newSettings.webSearch },
    };

    set({ settings: updatedSettings });

    try {
      await window.electronAPI.settingsPersistence.save(updatedSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  },

  resetSettings: async () => {
    try {
      const defaultSettings =
        await window.electronAPI.settingsPersistence.reset();
      set({ settings: defaultSettings });
    } catch (error) {
      console.error("Failed to reset settings:", error);
      set({ settings: DEFAULT_SETTINGS });
    }
  },

  exportSettings: async () => {
    try {
      const currentSettings = get().settings;
      return await window.electronAPI.settingsPersistence.export(
        currentSettings
      );
    } catch (error) {
      console.error("Failed to export settings:", error);
      return null;
    }
  },

  importSettings: async () => {
    try {
      const importedSettings =
        await window.electronAPI.settingsPersistence.import();
      if (importedSettings) {
        set({ settings: importedSettings });
        await window.electronAPI.settingsPersistence.save(importedSettings);
      }
    } catch (error) {
      console.error("Failed to import settings:", error);
    }
  },
}));
