/**
 * Tool Step
 *
 * One tool call inside a reply, as a single quiet line - "Wrote index.html",
 * "Edited styles.css +4 −2" - that opens to show what the tool returned.
 * Replaces the boxed ToolResultMessage rows (removed), which gave every
 * call the same visual weight as the conversation itself.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  CircleAlert,
  FilePen,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  Globe,
  Link,
  ListChecks,
  Loader2,
  Search,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resultBody, stepDetail, stepLabel } from "./turns";

const ICONS: Record<string, LucideIcon> = {
  read_file: FileText,
  read_text_file: FileText,
  read_media_file: FileText,
  read_multiple_files: FileText,
  write_file: FilePlus,
  edit_file: FilePen,
  create_directory: FolderPlus,
  list_directory: FolderOpen,
  list_directory_with_sizes: FolderOpen,
  directory_tree: FolderOpen,
  list_allowed_directories: FolderOpen,
  search_files: Search,
  get_file_info: FileText,
  move_file: FilePen,
  delete_file: Trash2,
  web_search: Globe,
  fetch_page: Link,
};

interface ToolStepProps {
  tool: string;
  serverName: string;
  target?: string;
  /** Omitted while running */
  content?: string;
  success?: boolean;
  /** Plan mode declined to run it - a planned step, not an error */
  blocked?: boolean;
  running?: boolean;
}

/** A unified diff with added and removed lines tinted */
function DiffBody({ body }: { body: string }) {
  return (
    <>
      {body.split("\n").map((line, i) => (
        <div
          key={i}
          className={cn(
            line.startsWith("+") &&
              !line.startsWith("+++") &&
              "bg-green-500/10 text-green-600 dark:text-green-400",
            line.startsWith("-") &&
              !line.startsWith("---") &&
              "bg-red-500/10 text-red-600 dark:text-red-400",
            line.startsWith("@@") && "text-muted-foreground/60"
          )}
        >
          {line || " "}
        </div>
      ))}
    </>
  );
}

export function ToolStep({
  tool,
  serverName,
  target,
  content = "",
  success = true,
  blocked,
  running,
}: ToolStepProps) {
  const [expanded, setExpanded] = useState(false);

  if (running) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          {stepLabel(tool, serverName, target, "running")}…
        </motion.span>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground">
        <ListChecks className="h-3.5 w-3.5 shrink-0" />
        <span>Planned: {stepLabel(tool, serverName, target, "done")}</span>
        <span className="text-muted-foreground/60">not run</span>
      </div>
    );
  }

  const body = resultBody(content);
  const detail = stepDetail(tool, body, success);
  const isDiff = tool === "edit_file" && success && /^@@ /m.test(body);
  const Icon = success ? (ICONS[tool] ?? Wrench) : CircleAlert;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group/step flex max-w-full items-center gap-2 py-0.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Icon
          className={cn("h-3.5 w-3.5 shrink-0", !success && "text-destructive")}
        />
        <span className="shrink-0">
          {stepLabel(tool, serverName, target, "done")}
        </span>
        {detail && (
          <span
            className={cn(
              "truncate",
              success ? "text-muted-foreground/60" : "text-destructive/80"
            )}
          >
            {detail}
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover/step:opacity-100",
            expanded && "rotate-90"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1 mb-2 overflow-hidden rounded-md border border-border/60 bg-muted/30">
              {target && (
                <div className="truncate border-b border-border/60 px-3 py-1.5 font-mono text-[11px] text-muted-foreground/70">
                  {target}
                </div>
              )}
              <pre className="max-h-72 overflow-auto px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {isDiff ? <DiffBody body={body} /> : body || "(no output)"}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ToolStepGroupProps {
  label: string;
  failed: number;
  children: React.ReactNode;
}

/**
 * Consecutive calls with no text between them, collapsed to one line -
 * "Created 2 folders" - that opens to the individual steps.
 */
export function ToolStepGroup({ label, failed, children }: ToolStepGroupProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="group/step flex items-center gap-2 py-0.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
        {failed > 0 && (
          <span className="text-destructive/80">· {failed} failed</span>
        )}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 opacity-50 transition-transform group-hover/step:opacity-100",
            expanded && "rotate-90"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mt-1 mb-2 space-y-0.5 rounded-md border border-border/60 px-3 py-1.5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
