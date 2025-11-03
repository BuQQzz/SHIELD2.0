import { create } from "zustand";
import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";

interface SettingsStore {
  settings: AppSettings;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const savedSettings = await window.electronAPI.settings.load();
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
    };

    set({ settings: updatedSettings });

    try {
      await window.electronAPI.settings.save(updatedSettings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  },

  resetSettings: async () => {
    set({ settings: DEFAULT_SETTINGS });
    try {
      await window.electronAPI.settings.save(DEFAULT_SETTINGS);
    } catch (error) {
      console.error("Failed to reset settings:", error);
    }
  },
}));
