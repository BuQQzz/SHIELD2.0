/**
 * Tool Permission Bar
 *
 * A thin strip that sits directly above the composer when a tool call is
 * waiting on the user. It replaces the centered modal dialogs, which stole
 * focus and hid the conversation behind an overlay for what is usually a
 * one-word decision.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  FileText,
  FolderOpen,
  Globe,
  Pencil,
  Shield,
  SquareTerminal,
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
  if (request.command !== undefined) return SquareTerminal;
  if (request.webTarget !== undefined) return Globe;
  if (request.previewContent !== undefined) return Pencil;
  if (request.isMutating) return FileText;
  if (
    request.toolName.startsWith("list") ||
    request.toolName.includes("directory")
  )
    return FolderOpen;
  return Shield;
}

/**
 * A script the command runs that the model wrote itself. Approving the
 * command approves whatever is in it, so it can be read first.
 */
function ModelScript({
  script,
}: {
  script: { path: string; content?: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 text-amber-600 dark:text-amber-400">
        <span>Runs {script.path}, which the model wrote in this session.</span>
        {script.content !== undefined && (
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide script" : "Show script"}
          </button>
        )}
      </div>
      {open && script.content !== undefined && (
        <pre className="mt-1 max-h-64 overflow-auto rounded bg-background/70 px-2 py-1 font-mono text-[11px] leading-snug">
          {script.content}
        </pre>
      )}
    </div>
  );
}

export function ToolPermissionBar({
  request,
  onApprove,
  onDeny,
}: ToolPermissionBarProps) {
  const Icon = request ? toolIcon(request) : Shield;
  // Deletes and commands are confirmed one at a time (useMCPDialogs)
  const oneAtATime = request?.isDestructive || request?.command !== undefined;

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
          <div
            className={`flex gap-3 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm backdrop-blur ${
              request.command !== undefined ? "items-start" : "items-center"
            }`}
          >
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
                  : request.command !== undefined
                    ? "Run this command?"
                    : request.toolName}
              </span>
              {request.commandReason && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {request.commandReason}
                </p>
              )}
              {request.command !== undefined && (
                <code className="mt-1 block max-h-24 overflow-y-auto whitespace-pre-wrap break-all rounded bg-background/70 px-2 py-1 font-mono text-xs">
                  {request.command}
                </code>
              )}
              {request.modelScripts?.map((script) => (
                <ModelScript key={script.path} script={script} />
              ))}
              {request.targetPath && (
                <span
                  className="ml-2 truncate text-xs text-muted-foreground"
                  title={request.targetPath}
                >
                  {shortenPath(request.targetPath)}
                </span>
              )}
              {request.webTarget && (
                <span
                  className="ml-2 truncate text-xs text-muted-foreground"
                  title={request.webTarget}
                >
                  {request.webTarget}
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
              {!oneAtATime && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => onApprove(true)}
                  title="Don't ask again for this tool until SHIELD is closed"
                >
                  Allow for session
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => onApprove(false)}
              >
                {request.isDestructive
                  ? "Move to Recycle Bin"
                  : request.command !== undefined
                    ? "Run"
                    : "Allow"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
