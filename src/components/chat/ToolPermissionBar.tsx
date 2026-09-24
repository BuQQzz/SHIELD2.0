/**
 * Tool Permission Bar
 *
 * A thin strip that sits directly above the composer when a tool call is
 * waiting on the user. It replaces the centered modal dialogs, which stole
 * focus and hid the conversation behind an overlay for what is usually a
 * one-word decision.
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  FileText,
  FolderOpen,
  Pencil,
  Shield,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingToolRequest } from "@/hooks/useMCPDialogs";

interface ToolPermissionBarProps {
  request: PendingToolRequest | null;
  onApprove: (remember: boolean) => void;
  onDeny: () => void;
}

/** Shorten a long path from the left so the filename stays visible */
function shortenPath(path: string, max = 52): string {
  if (path.length <= max) return path;
  return `...${path.slice(-(max - 3))}`;
}

function toolIcon(request: PendingToolRequest) {
  if (request.isDestructive) return Trash2;
  if (request.previewContent !== undefined) return Pencil;
  if (request.isMutating) return FileText;
  if (
    request.toolName.startsWith("list") ||
    request.toolName.includes("directory")
  )
    return FolderOpen;
  return Shield;
}

export function ToolPermissionBar({
  request,
  onApprove,
  onDeny,
}: ToolPermissionBarProps) {
  const Icon = request ? toolIcon(request) : Shield;

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="mx-auto mb-2 w-full max-w-3xl px-4"
        >
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm backdrop-blur">
            <Icon
              className={`h-4 w-4 shrink-0 ${
                request.isDestructive
                  ? "text-red-500"
                  : request.isMutating
                    ? "text-amber-500"
                    : "text-muted-foreground"
              }`}
            />

            <div className="min-w-0 flex-1">
              <span className="font-medium">
                {request.isDestructive
                  ? "Move to Recycle Bin"
                  : request.toolName}
              </span>
              {request.targetPath && (
                <span
                  className="ml-2 truncate text-xs text-muted-foreground"
                  title={request.targetPath}
                >
                  {shortenPath(request.targetPath)}
                </span>
              )}
              {request.destinationPath && (
                <span
                  className="ml-1 inline-flex items-center gap-1 truncate text-xs text-muted-foreground"
                  title={request.destinationPath}
                >
                  <ArrowRight className="h-3 w-3" />
                  {shortenPath(request.destinationPath)}
                </span>
              )}
              {request.previewContent !== undefined && (
                <span className="ml-2 text-xs text-muted-foreground">
                  · {request.previewContent.length} chars
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={onDeny}
              >
                Deny
              </Button>
              {!request.isDestructive && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => onApprove(true)}
                >
                  Allow always
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => onApprove(false)}
              >
                {request.isDestructive ? "Move to Recycle Bin" : "Allow"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
