/**
 * Tool Result Message
 *
 * Tool output is stored on the user turn because that is what the chat
 * template expects, but rendering it as a user bubble made it look like the
 * person had pasted a wall of JSON into the conversation. This renders it as
 * what it is: a collapsed record of a tool that ran.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ListChecks,
  Terminal,
} from "lucide-react";

interface ToolResultMessageProps {
  tool: string;
  serverName: string;
  success: boolean;
  /** Plan mode declined to run it - a planned step, not an error */
  blocked?: boolean;
  content: string;
}

/** Pull the readable payload out of the <tool_result> envelope */
function extractResult(content: string): string {
  const result = content.match(/<result>([\s\S]*?)<\/result>/);
  if (result?.[1]) return result[1].trim();

  const error = content.match(/<error>([\s\S]*?)<\/error>/);
  if (error?.[1]) return error[1].trim();

  return content.trim();
}

/** One-line gist for the collapsed state */
function summarize(body: string, success: boolean): string {
  if (!success) return body.split("\n")[0]?.slice(0, 80) ?? "failed";

  const fileCount = (body.match(/\[FILE\]/g) ?? []).length;
  const dirCount = (body.match(/\[DIR\]/g) ?? []).length;
  if (fileCount || dirCount) {
    return `${fileCount} file${fileCount === 1 ? "" : "s"}, ${dirCount} folder${
      dirCount === 1 ? "" : "s"
    }`;
  }

  const chars = body.length;
  return chars > 120
    ? `${chars} characters`
    : body.split("\n")[0]!.slice(0, 80);
}

export function ToolResultMessage({
  tool,
  serverName,
  success,
  blocked,
  content,
}: ToolResultMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const body = extractResult(content);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  // A blocked call is the plan, so show the step rather than an error
  if (blocked) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="flex justify-start"
      >
        <div className="w-full max-w-[85%] overflow-hidden rounded-md border border-dashed border-border/70 bg-muted/20">
          <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
            <span className="h-3.5 w-3.5 shrink-0" />
            <ListChecks className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">
              Would run {serverName}.{tool}
            </span>
            <span className="text-muted-foreground/70">not executed</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex justify-start"
    >
      <motion.div
        // A brief tint on arrival, settling to the resting colour, so a
        // finished call reads as "that just completed" without a hard flash
        initial={{
          backgroundColor: success
            ? "rgba(34,197,94,0.10)"
            : "rgba(239,68,68,0.10)",
        }}
        animate={{ backgroundColor: "rgba(0,0,0,0)" }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="w-full max-w-[85%] overflow-hidden rounded-md border border-border/60 bg-muted/30"
      >
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
          aria-expanded={expanded}
        >
          <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {success ? (
            <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <CircleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
          )}
          <span className="font-medium text-muted-foreground">
            {serverName}.{tool}
          </span>
          <span className="truncate text-muted-foreground/70">
            {summarize(body, success)}
          </span>
        </button>

        {expanded && (
          <pre className="max-h-72 overflow-auto border-t border-border/60 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
            {body}
          </pre>
        )}
      </motion.div>
    </motion.div>
  );
}
