/**
 * Background commands: a server or watcher the model starts and stops
 *
 * run_command must end on its own, so a task that says "start the server,
 * try it with curl, stop it" could not be done: GLM 5.3 Flash's server
 * command ran into the 120 s limit and it had to work around it
 * (2026-11-23). With background: true the command keeps running; the
 * model reads what it printed with command_output and ends it with
 * stop_command.
 *
 * Same shell, folder, environment and permission check as run_command
 * (the renderer decides on the command before it gets here). The model is
 * responsible for stopping what it starts (the user's call, 2026-11-23): a
 * job outlives the turn, so "start the dev server" can mean it. The chat
 * lists every job under Tasks running, where the user can stop it
 * (runningTasks.ts). SHIELD closing ends them.
 */

import { spawn, type ChildProcess } from "child_process";
import { StringDecoder } from "string_decoder";
import type { MCPToolResult } from "./MCPServerConfig.js";

export const COMMAND_OUTPUT_TOOL_NAME = "command_output";
export const STOP_COMMAND_TOOL_NAME = "stop_command";

/** Jobs running at once */
export const MAX_JOBS = 4;
/** Output kept per job; older output is dropped */
export const JOB_LOG_CHARS = 40_000;
/** Most new output handed back in one command_output */
export const JOB_READ_CHARS = 8000;
/** How long a start waits for first output, or for the command to fail */
export const START_WAIT_MS = 3000;
/** Longest a command_output may wait for new output */
export const MAX_WAIT_SECONDS = 30;

// eslint-disable-next-line no-control-regex -- colour codes start with ESC
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

interface Job {
  id: number;
  command: string;
  child: ChildProcess;
  startedAt: number;
  /** Output kept, its first character being number `dropped` overall */
  log: string;
  dropped: number;
  /** Characters handed to the model so far, counted overall */
  read: number;
  exitCode: number | null;
  exited: boolean;
  /** Called on new output or exit, for a waiting command_output */
  wake: (() => void) | null;
}

const jobs = new Map<number, Job>();
let nextId = 1;

export interface JobDeps {
  spawn: typeof spawn;
  kill: (child: ChildProcess) => void;
}

const fail = (error: string): MCPToolResult => ({ success: false, error });
const text = (body: string): MCPToolResult => ({
  success: true,
  data: { content: [{ type: "text", text: body }] },
});

function clean(output: string): string {
  return output.replace(ANSI, "").replace(/\r\n/g, "\n");
}

function append(job: Job, chunk: string): void {
  job.log += chunk;
  if (job.log.length > JOB_LOG_CHARS) {
    const cut = job.log.length - JOB_LOG_CHARS;
    job.log = job.log.slice(cut);
    job.dropped += cut;
  }
  job.wake?.();
}

/** Output the model has not seen yet, at most JOB_READ_CHARS of its end */
function unread(job: Job): string {
  const from = Math.max(job.read - job.dropped, 0);
  const missed = job.read < job.dropped ? job.dropped - job.read : 0;
  let fresh = job.log.slice(from);
  job.read = job.dropped + job.log.length;
  let skipped = missed;
  if (fresh.length > JOB_READ_CHARS) {
    skipped += fresh.length - JOB_READ_CHARS;
    fresh = fresh.slice(-JOB_READ_CHARS);
  }
  const note = skipped
    ? `[... ${skipped.toLocaleString("en-US")} earlier characters not shown ...]\n`
    : "";
  return note + clean(fresh).trimEnd();
}

function status(job: Job): string {
  const seconds = Math.round((Date.now() - job.startedAt) / 1000);
  return job.exited
    ? `Job ${job.id} has ended (exit code ${job.exitCode ?? "unknown"}) after ${seconds} s.`
    : `Job ${job.id} is running (${seconds} s).`;
}

function findJob(args: Record<string, unknown>): Job | string {
  const id = Number(args.job);
  const job = jobs.get(id);
  if (job) return job;
  const known = [...jobs.keys()];
  return `No background job ${String(args.job)}. ${known.length ? `Jobs: ${known.join(", ")}.` : "None is running."}`;
}

/** Resolves on new output or exit, or after `ms` */
function waitForNews(job: Job, ms: number): Promise<void> {
  if (ms <= 0 || job.exited) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      job.wake = null;
      resolve();
    }
    job.wake = done;
  });
}

/** Starts a command that keeps running. `file`/`args`: the shell invocation */
export async function startJob(
  command: string,
  invocation: { file: string; args: string[] },
  cwd: string,
  env: NodeJS.ProcessEnv,
  deps: JobDeps,
  waitMs = START_WAIT_MS
): Promise<MCPToolResult> {
  const live = [...jobs.values()].filter((job) => !job.exited);
  if (live.length >= MAX_JOBS) {
    return fail(
      `${MAX_JOBS} background jobs are running already (${live.map((job) => job.id).join(", ")}). Stop one with stop_command first.`
    );
  }
  let child: ChildProcess;
  try {
    child = deps.spawn(invocation.file, invocation.args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
  } catch (error) {
    return fail(
      `Could not start the command: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const job: Job = {
    id: nextId++,
    command,
    child,
    startedAt: Date.now(),
    log: "",
    dropped: 0,
    read: 0,
    exitCode: null,
    exited: false,
    wake: null,
  };
  jobs.set(job.id, job);
  for (const stream of [child.stdout, child.stderr]) {
    const decoder = new StringDecoder("utf8");
    stream?.on("data", (chunk: Buffer) => append(job, decoder.write(chunk)));
    stream?.on("end", () => append(job, decoder.end()));
  }
  let startError: string | null = null;
  child.on("error", (error) => {
    startError = error.message;
    job.exited = true;
    job.wake?.();
  });
  child.on("close", (code) => {
    job.exitCode = code;
    job.exited = true;
    job.wake?.();
  });

  // A server that fails at once (port in use, a syntax error) says so now
  const until = Date.now() + waitMs;
  while (!job.exited && Date.now() < until) {
    await waitForNews(job, until - Date.now());
  }
  if (startError) {
    jobs.delete(job.id);
    return fail(`Could not start the command: ${startError}`);
  }
  const output = unread(job);
  const shown = output ? `\nOutput so far:\n${output}` : "\n(no output yet)";
  if (job.exited) {
    return text(
      `${status(job)} It was started in the background but ended at once.${shown}`
    );
  }
  return text(
    `Started in the background as job ${job.id}. ${status(job)}${shown}\nRead its new output with command_output (job ${job.id}). It keeps running after your turn: stop it with stop_command (job ${job.id}) when you are done with it. The user sees it under Tasks running and can stop it too.`
  );
}

/** command_output: what a job printed since it was last read */
export async function jobOutput(
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  const found = findJob(args);
  if (typeof found === "string") return fail(found);
  const waitSeconds = Number(args.wait_seconds);
  const waitMs =
    Number.isFinite(waitSeconds) && waitSeconds > 0
      ? Math.min(waitSeconds, MAX_WAIT_SECONDS) * 1000
      : 0;
  if (found.read - found.dropped >= found.log.length) {
    await waitForNews(found, waitMs);
  }
  const output = unread(found);
  return text(`${status(found)}\n${output ? output : "(no new output)"}`);
}

/** stop_command: ends a job and what it started */
export function stopJob(
  args: Record<string, unknown>,
  kill: (child: ChildProcess) => void
): MCPToolResult {
  const found = findJob(args);
  if (typeof found === "string") return fail(found);
  if (!found.exited) kill(found.child);
  const output = unread(found);
  jobs.delete(found.id);
  return text(
    `Job ${found.id} stopped.${output ? `\nIts last output:\n${output}` : ""}`
  );
}

/** The jobs still running, for the chat's "Tasks running" list */
export function runningJobs(): {
  id: number;
  command: string;
  startedAt: number;
  pid?: number;
}[] {
  return [...jobs.values()]
    .filter((job) => !job.exited)
    .map((job) => ({
      id: job.id,
      command: job.command,
      startedAt: job.startedAt,
      pid: job.child.pid,
    }));
}

/** SHIELD closing. Returns how many were running. */
export function stopAllJobs(kill: (child: ChildProcess) => void): number {
  let count = 0;
  for (const job of jobs.values()) {
    if (!job.exited) {
      kill(job.child);
      count++;
    }
  }
  jobs.clear();
  return count;
}

export const COMMAND_OUTPUT_TOOL = {
  name: COMMAND_OUTPUT_TOOL_NAME,
  description:
    "Read what a background job (started with run_command and background: true) printed since you last read it, and whether it is still running.",
  inputSchema: {
    type: "object",
    properties: {
      job: { type: "number", description: "The job number run_command gave" },
      wait_seconds: {
        type: "number",
        description: `Wait up to this long for new output when there is none yet (at most ${MAX_WAIT_SECONDS})`,
      },
    },
    required: ["job"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

export const STOP_COMMAND_TOOL = {
  name: STOP_COMMAND_TOOL_NAME,
  description:
    "Stop a background job you started with run_command (background: true), and everything it started.",
  inputSchema: {
    type: "object",
    properties: {
      job: { type: "number", description: "The job number run_command gave" },
    },
    required: ["job"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};
