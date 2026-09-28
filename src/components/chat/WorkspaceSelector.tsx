/**
 * Project Folder
 *
 * The folder a Code session works in: its file tools may use that folder
 * and nothing else. Sits next to the permission mode because together they
 * answer "what can SHIELD touch, and how freely". Choosing another folder
 * moves the session there. Chats have no file tools, so no chip.
 */

import { useState } from "react";
import { toast } from "sonner";
import { ChevronUp, FolderOpen, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApplyWorkspace } from "@/hooks/useApplyWorkspace";
import { folderName } from "@/lib/sessions";
import { useConversationStore } from "@/stores/conversation-store";

export function WorkspaceSelector() {
  const folder = useConversationStore(
    (state) => state.currentConversation?.folder
  );
  const applyWorkspace = useApplyWorkspace();
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    const picked = await window.electronAPI.mcp.chooseWorkspace();
    if (!picked) return;
    setBusy(true);
    try {
      const applied = await applyWorkspace(picked);
      if (!applied) return;
      const store = useConversationStore.getState();
      store.updateConversation({ folder: applied });
      if (store.currentConversation?.messages.length) {
        await store.saveCurrentConversation();
      }
      toast.success(`This session now works in ${folderName(applied)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex min-w-0 max-w-[14rem] shrink items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          title={
            folder
              ? `File tools can use: ${folder}`
              : "Choose the folder this session works in"
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">
            {folder ? folderName(folder) : "Choose folder"}
          </span>
          <ChevronUp className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Project folder
        </DropdownMenuLabel>
        {folder && (
          <p className="break-all px-2 pb-2 text-xs text-foreground">
            {folder}
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={choose}
          className="flex cursor-pointer items-center gap-2"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {folder ? "Move this session to another folder…" : "Choose folder…"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
