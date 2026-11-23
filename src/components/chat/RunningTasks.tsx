/**
 * Tasks running: what the model started that is still going - a server it
 * left running with nohup, a background job - with a Stop for each. The
 * model is responsible for stopping what it starts; this is how the user
 * sees what it left and ends it themselves (electron/services/
 * runningTasks.ts). Hidden when nothing runs.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, SquareTerminal } from "lucide-react";
import type { RunningTask } from "@/types/electron";
import { cn } from "@/lib/utils";

/** How often the list is read while the chat is open */
const POLL_MS = 3000;

export function elapsedText(since: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function RunningTasks() {
  const [tasks, setTasks] = useState<RunningTask[]>([]);
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.electronAPI?.mcp
      ?.listTasks?.()
      .catch(() => undefined);
    if (result?.success) setTasks(result.tasks ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  if (tasks.length === 0) return null;

  const stop = async (id: string) => {
    setStopping(id);
    await window.electronAPI?.mcp?.stopTask?.(id).catch(() => undefined);
    setStopping(null);
    await refresh();
  };

  return (
    <div
      className="mb-1.5 rounded-lg bg-soft px-2.5 py-1 text-xs"
      aria-label="Tasks running"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open && "rotate-90"
          )}
        />
        <SquareTerminal className="h-3.5 w-3.5" />
        <span>
          {tasks.length} task{tasks.length === 1 ? "" : "s"} running
        </span>
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-1 pb-0.5">
          {tasks.map((task) => (
            <li key={task.id} className="flex min-w-0 items-center gap-2 pl-5">
              <span
                className="min-w-0 flex-1 truncate font-mono"
                title={[task.command, ...task.processes].join("\n")}
              >
                {task.processes[0] ?? task.command}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {elapsedText(task.startedAt)}
              </span>
              <button
                type="button"
                className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                onClick={() => void stop(task.id)}
                disabled={stopping === task.id}
              >
                {stopping === task.id ? "Stopping…" : "Stop"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
