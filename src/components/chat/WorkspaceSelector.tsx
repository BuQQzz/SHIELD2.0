/**
 * Workspace Selector
 *
 * Which folder SHIELD's file tools may use. Sits next to the permission mode
 * because together they answer "what can SHIELD touch, and how freely".
 *
 * Choosing a folder is the user granting access, so it also turns file tools
 * on if they were off. The filesystem server is restarted with the folder
 * before the setting is saved, so the tool list and the model's prompt only
 * change once the new folder is actually in effect.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronUp, FolderOpen, Loader2, RotateCcw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettingsStore } from "@/store/settingsStore";

/** Last path segment, for the compact chip label */
function folderName(folder: string): string {
  const parts = folder.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? folder;
}

export function WorkspaceSelector() {
  const { settings, updateSettings } = useSettingsStore();
  const [busy, setBusy] = useState(false);

  const workspace = settings.mcp?.workspaceFolder;
  const toolsOn = settings.mcp?.enabled ?? false;
  const label = !toolsOn
    ? "No folder"
    : workspace
      ? folderName(workspace)
      : "Documents & Desktop";

  const apply = async (folder: string | null) => {
    setBusy(true);
    try {
      const result = await window.electronAPI.mcp.setWorkspace(folder);
      if (!result.success) {
        toast.error(result.error ?? "Couldn't use that folder");
        return;
      }
      await updateSettings({
        mcp: {
          ...settings.mcp,
          workspaceFolder: result.folder ?? undefined,
          enabled: folder ? true : settings.mcp.enabled,
        },
      });
      toast.success(
        folder
          ? `SHIELD can now use ${folderName(folder)}`
          : "SHIELD is back to Documents and Desktop"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const choose = async () => {
    const folder = await window.electronAPI.mcp.chooseWorkspace();
    if (folder) await apply(folder);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-w-0 max-w-[14rem] shrink items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          title={
            toolsOn
              ? `File tools can use: ${workspace ?? "Documents and Desktop"}`
              : "File tools are off - choose a folder to turn them on"
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{label}</span>
          <ChevronUp className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Folder SHIELD can use
        </DropdownMenuLabel>
        {toolsOn && (
          <p className="break-all px-2 pb-2 text-xs text-foreground">
            {workspace ?? "Documents and Desktop (default)"}
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={choose}
          className="flex cursor-pointer items-center gap-2"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Choose folder…
        </DropdownMenuItem>
        {workspace && (
          <DropdownMenuItem
            onClick={() => apply(null)}
            className="flex cursor-pointer items-center gap-2"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Use default folders
          </DropdownMenuItem>
        )}
        {!toolsOn && !workspace && (
          <DropdownMenuItem
            onClick={() =>
              updateSettings({ mcp: { ...settings.mcp, enabled: true } })
            }
            className="flex cursor-pointer items-center gap-2"
          >
            <Check className="h-3.5 w-3.5" />
            Use Documents and Desktop
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
