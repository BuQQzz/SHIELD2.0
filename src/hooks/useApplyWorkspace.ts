import { useCallback } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * Point the file tools at a folder: the filesystem server is restarted with
 * it before the setting is saved, so the tool list and the model's prompt
 * change only once the folder is in effect. Resolves to the folder as the
 * main process spelled it, or null when that failed (the user is told).
 */
export function useApplyWorkspace() {
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return useCallback(
    async (folder: string): Promise<string | null> => {
      try {
        const result = await window.electronAPI.mcp.setWorkspace(folder);
        if (!result.success || !result.folder) {
          toast.error(result.error ?? "Couldn't use that folder");
          return null;
        }
        const { settings } = useSettingsStore.getState();
        // Choosing a folder is the user granting access: file tools on
        await updateSettings({
          mcp: {
            ...settings.mcp,
            workspaceFolder: result.folder,
            enabled: true,
          },
        });
        return result.folder;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return null;
      }
    },
    [updateSettings]
  );
}

/** Same folder, however it is spelled: Windows ignores case and a trailing separator */
export function sameFolder(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase();
  return norm(a) === norm(b);
}
