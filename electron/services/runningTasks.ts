/**
 * Tasks running: what the model started that is still going
 *
 * The model is responsible for stopping what it starts (the user's call,
 * 2026-11-23), and the user should see what that is and be able to end it
 * themselves, as Claude Code shows its background tasks. Two kinds:
 *
 * - jobs: run_command with background: true (backgroundJobs.ts)
 * - left: processes a command left running when it ended, such as
 *   `nohup python3 server.py &`. Every flash model tested started its test
 *   server that way, never with background: true (2026-11-23).
 *
 * Finding what a command left: every command carries SHIELD_TASK_ID in its
 * environment, which its processes keep even when they leave its process
 * group - DeepSeek V4.1 Flash started its server with `setsid nohup ...
 * & disown` (2026-11-23). On Linux the marker is read from /proc. Elsewhere
 * the command's process group is used, which a setsid process leaves. Not
 * on Windows.
 */

import { execFileSync } from "child_process";
import type { ChildProcess } from "child_process";
import fs from "fs";
import { runningJobs, stopJob } from "./backgroundJobs.js";

export const TASK_ID_VAR = "SHIELD_TASK_ID";

export interface RunningTask {
  /** "job-3" or "left-<task id>" */
  id: string;
  kind: "job" | "left";
  /** The command the model ran */
  command: string;
  startedAt: number;
  /** What is running: the processes' own command lines */
  processes: string[];
}

export interface FoundProcess {
  pid: number;
  args: string;
}

/** The processes a command left: by its task id, or its process group */
export type FindProcesses = (taskId: string, pgid?: number) => FoundProcess[];

let counter = 0;
/** A new id for one command's processes */
export function newTaskId(): string {
  counter += 1;
  return `${process.pid}-${Date.now().toString(36)}-${counter}`;
}

/** Linux: every process of this user whose environment has the marker */
export function findByMarker(
  taskId: string,
  proc = "/proc",
  fsys: Pick<typeof fs, "readdirSync" | "readFileSync"> = fs
): FoundProcess[] {
  const marker = `${TASK_ID_VAR}=${taskId}`;
  const found: FoundProcess[] = [];
  let entries: string[] = [];
  try {
    entries = fsys.readdirSync(proc) as string[];
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid) continue;
    try {
      const env = fsys.readFileSync(`${proc}/${entry}/environ`, "latin1");
      if (!env.split("\0").includes(marker)) continue;
      const args = fsys
        .readFileSync(`${proc}/${entry}/cmdline`, "utf8")
        .split("\0")
        .filter(Boolean)
        .join(" ");
      found.push({ pid: Number(entry), args });
    } catch {
      // Someone else's process, or one that just ended
    }
  }
  return found;
}

/** macOS and others: what is still in the command's process group */
function findByGroup(pgid: number | undefined): FoundProcess[] {
  if (pgid === undefined) return [];
  try {
    return execFileSync("ps", ["-eo", "pid=,pgid=,args="], {
      encoding: "utf8",
      timeout: 3000,
    })
      .split("\n")
      .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .filter((m) => Number(m[2]) === pgid && Number(m[1]) !== process.pid)
      .map((m) => ({ pid: Number(m[1]), args: m[3]! }));
  } catch {
    return [];
  }
}

const defaultFind: FindProcesses = (taskId, pgid) =>
  process.platform === "linux" ? findByMarker(taskId) : findByGroup(pgid);

interface Left {
  taskId: string;
  pgid?: number;
  command: string;
  startedAt: number;
}

const left = new Map<string, Left>();

/**
 * After a command's shell exits: the processes it left running, now on
 * the Tasks running list. Empty when it left nothing (or on Windows).
 */
export function noteLeftovers(
  taskId: string,
  pgid: number | undefined,
  command: string,
  startedAt: number,
  find: FindProcesses = defaultFind
): FoundProcess[] {
  if (process.platform === "win32") return [];
  const still = find(taskId, pgid);
  if (still.length > 0) left.set(taskId, { taskId, pgid, command, startedAt });
  return still;
}

/** Everything still running, oldest first; finished ones drop off */
export function runningTasks(find: FindProcesses = defaultFind): RunningTask[] {
  const tasks: RunningTask[] = runningJobs().map((job) => ({
    id: `job-${job.id}`,
    kind: "job",
    command: job.command,
    startedAt: job.startedAt,
    processes: [],
  }));
  for (const task of left.values()) {
    const still = find(task.taskId, task.pgid);
    if (still.length === 0) {
      left.delete(task.taskId);
      continue;
    }
    tasks.push({
      id: `left-${task.taskId}`,
      kind: "left",
      command: task.command,
      startedAt: task.startedAt,
      processes: still.map((p) => p.args),
    });
  }
  return tasks.sort((a, b) => a.startedAt - b.startedAt);
}

/** Ends a process and, when it leads a group, everything in that group */
function killProcess(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone
    }
  }
}

/** The user pressed Stop on a task */
export function stopTask(
  id: string,
  kill: (child: ChildProcess) => void,
  find: FindProcesses = defaultFind,
  killPid: (pid: number) => void = killProcess
): boolean {
  const job = /^job-(\d+)$/.exec(id);
  if (job) return stopJob({ job: Number(job[1]) }, kill).success;
  const task = left.get(id.replace(/^left-/, ""));
  // Only what SHIELD itself noted: never an arbitrary process
  if (!task || !id.startsWith("left-")) return false;
  for (const p of find(task.taskId, task.pgid)) killPid(p.pid);
  left.delete(task.taskId);
  return true;
}

/** The note added to a command's result when it left something running */
export function leftoverNote(still: FoundProcess[]): string {
  if (still.length === 0) return "";
  const shown = still
    .slice(0, 4)
    .map((p) => `${p.args.slice(0, 120)} (pid ${p.pid})`)
    .join("; ");
  return `\n\n[Still running after this command: ${shown}. It keeps running after your turn: stop it when you are done with it, or tell the user you left it running on purpose. The user sees it under Tasks running and can stop it too.]`;
}
