import { ipcRenderer } from "electron";
import type { SystemAPI } from "../src/types/electron";

export const systemAPI: SystemAPI = {
  selectDirectory: () => ipcRenderer.invoke("system:select-directory"),
};
