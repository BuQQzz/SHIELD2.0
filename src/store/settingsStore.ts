import { create } from "zustand";
import { AppSettings, DEFAULT_SETTINGS } from "@/types/settings";

interface SettingsStore {
  settings: AppSettings;
  isLoading: boolean;
  /** Saved settings have been read (or failed to) since launch */
  hasLoaded: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  exportSettings: () => Promise<string | null>;
  importSettings: () => Promise<void>;
}

/** The load in progress, so a save can wait for it */
let loading: Promise<void> | null = null;

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  hasLoaded: false,

  loadSettings: () => {
    loading = (async () => {
      set({ isLoading: true });
      try {
        const savedSettings =
          await window.electronAPI.settingsPersistence.load();
        if (savedSettings) {
          // Merge saved settings with defaults to handle missing properties
          const mergedSettings: AppSettings = {
            ...DEFAULT_SETTINGS,
            ...savedSettings,
            model: { ...DEFAULT_SETTINGS.model, ...savedSettings.model },
            system: { ...DEFAULT_SETTINGS.system, ...savedSettings.system },
            privacy: { ...DEFAULT_SETTINGS.privacy, ...savedSettings.privacy },
            webSearch: {
              ...DEFAULT_SETTINGS.webSearch,
              ...savedSettings.webSearch,
            },
            mcp: { ...DEFAULT_SETTINGS.mcp, ...(savedSettings.mcp || {}) },
          };
          set({ settings: mergedSettings });
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        set({ isLoading: false, hasLoaded: true });
      }
    })();
    return loading;
  },

  updateSettings: async (newSettings: Partial<AppSettings>) => {
    // Merged into the defaults and saved before the user's settings had
    // loaded, a change wiped them: opening a code session at start-up saved
    // its folder over a reply length of 8192, web search on and the user's
    // system prompt (2026-09-28). A save now waits for the load.
    if (!get().hasLoaded) await (loading ?? get().loadSettings());
    const currentSettings = get().settings;
    const updatedSettings = {
      ...currentSettings,
      ...newSettings,
      model: { ...currentSettings.model, ...newSettings.model },
      system: { ...currentSettings.system, ...newSettings.system },
      privacy: { ...currentSettings.privacy, ...newSettings.privacy },
      webSearch: { ...currentSettings.webSearch, ...newSettings.webSearch },
      mcp: { ...currentSettings.mcp, ...newSettings.mcp },
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
        // Merge imported settings with defaults to handle missing properties
        const mergedSettings: AppSettings = {
          ...DEFAULT_SETTINGS,
          ...importedSettings,
          model: { ...DEFAULT_SETTINGS.model, ...importedSettings.model },
          system: { ...DEFAULT_SETTINGS.system, ...importedSettings.system },
          privacy: { ...DEFAULT_SETTINGS.privacy, ...importedSettings.privacy },
          webSearch: {
            ...DEFAULT_SETTINGS.webSearch,
            ...importedSettings.webSearch,
          },
          mcp: { ...DEFAULT_SETTINGS.mcp, ...(importedSettings.mcp || {}) },
        };
        set({ settings: mergedSettings });
        await window.electronAPI.settingsPersistence.save(mergedSettings);
      }
    } catch (error) {
      console.error("Failed to import settings:", error);
    }
  },
}));
