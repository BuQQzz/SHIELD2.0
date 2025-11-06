import { ipcRenderer } from "electron";
import type {
  SettingsAPI,
  SettingsPersistenceAPI,
  AppSettings,
} from "../src/types/electron";

export const settingsAPI: SettingsAPI = {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings) => ipcRenderer.invoke("settings:save", settings),
};

export const settingsPersistenceAPI: SettingsPersistenceAPI = {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (settings: AppSettings) =>
    ipcRenderer.invoke("settings:save", settings),
  export: (settings: AppSettings) =>
    ipcRenderer.invoke("settings:export", settings),
  import: () => ipcRenderer.invoke("settings:import"),
  reset: () => ipcRenderer.invoke("settings:reset"),
};
