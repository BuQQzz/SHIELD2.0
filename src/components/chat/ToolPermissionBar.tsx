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
import { trashName } from "@/utils/platform";

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

/**
 * A path that shortens its folders and always keeps the file name: the end
 * is what tells the user which file the call touches
 */
function PathText({ path, className }: { path: string; className?: string }) {
  const short = shortenPath(path);
  const cut = Math.max(short.lastIndexOf("/"), short.lastIndexOf("\\")) + 1;
  return (
    <span
      className={`flex min-w-0 text-xs text-muted-foreground ${className ?? ""}`}
      title={path}
    >
      <span className="min-w-0 truncate">{short.slice(0, cut)}</span>
      <span className="shrink-0">{short.slice(cut)}</span>
    </span>
  );
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

/**
 * The text a change to AGENTS.md would write: it is read into every future
 * session in this project, so it can be read before it is approved.
 */
function ProposedText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 text-amber-600 dark:text-amber-400">
        <span>SHIELD reads this file into every session in this project.</span>
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide the new text" : "Show the new text"}
        </button>
      </div>
      {open && (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background/70 px-2 py-1 font-mono text-[11px] leading-snug">
          {text}
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
  // Deletes, commands and AGENTS.md changes are confirmed one at a time
  // (useMCPDialogs)
  const oneAtATime =
    request?.isDestructive ||
    request?.command !== undefined ||
    request?.instructionsFile;

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
              request.command !== undefined || request.instructionsFile
                ? "items-start"
                : "items-center"
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
              {/* A flex row so a long path shortens with an ellipsis; as
                  inline text it ran under the Deny button */}
              <div className="flex min-w-0 items-baseline">
                <span className="shrink-0 font-medium">
                  {request.isDestructive
                    ? `Move to ${trashName()}`
                    : request.command !== undefined
                      ? "Run this command?"
                      : request.instructionsFile
                        ? request.toolName === "write_file"
                          ? "Write AGENTS.md?"
                          : "Change AGENTS.md?"
                        : request.toolName}
                </span>
                {request.targetPath && (
                  <PathText path={request.targetPath} className="ml-2" />
                )}
                {request.webTarget && (
                  <span
                    className="ml-2 min-w-0 truncate text-xs text-muted-foreground"
                    title={request.webTarget}
                  >
                    {request.webTarget}
                  </span>
                )}
                {request.destinationPath && (
                  <>
                    <ArrowRight className="ml-1 h-3 w-3 shrink-0 self-center text-muted-foreground" />
                    <PathText path={request.destinationPath} className="ml-1" />
                  </>
                )}
                {request.previewContent !== undefined && (
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    · {request.previewContent.length} chars
                  </span>
                )}
              </div>
              {request.instructionsFile && request.proposed !== undefined && (
                <ProposedText text={request.proposed} />
              )}
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
                  ? `Move to ${trashName()}`
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
