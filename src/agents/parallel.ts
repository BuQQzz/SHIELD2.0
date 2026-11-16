/**
 * Agents working at the same time, for a hosted model.
 *
 * SHIELD's llama-server has one slot, so a local model's agents take turns.
 * A hosted provider answers many requests at once, so the orchestrator may
 * delegate independent tasks in one reply and they run together. Two rules
 * keep that safe: at most MAX_PARALLEL_AGENTS run at once, and a file one
 * running agent is changing is not changed by another (FileClaims).
 */

import { isRemoteModelId } from "../services/remote/remoteEndpoint";

/** Agents at once on a hosted model: enough for a split task, few enough for rate limits */
export const MAX_PARALLEL_AGENTS = 4;

/** How many agents may run at once with this model: 1 for a local one */
export function parallelAgentsFor(modelId: string | undefined): number {
  return isRemoteModelId(modelId) ? MAX_PARALLEL_AGENTS : 1;
}

/** Replaces "Delegate one step at a time." in the orchestrator's prompt */
export const PARALLEL_NOTE = (limit: number) =>
  `Your team can work at the same time: when a request has parts that do not depend on each other (two separate files to change, a question about one area while code is written in another), put several delegate calls in one reply and they run together, up to ${limit}. Give each coder its own files: two agents may not change the same file at once. A step that needs another's result, such as testing or reviewing a change, goes in a later reply, after that report. Everything else, one step at a time.`;

/**
 * Starts the tasks with at most `limit` running at once. Each promise
 * settles when its own task does, so results can be taken in order while
 * later ones still run.
 */
export function inPool<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T>[] {
  let running = 0;
  const waiting: (() => void)[] = [];
  const slot = async () => {
    if (running >= limit) await new Promise<void>((r) => waiting.push(r));
    running += 1;
  };
  const free = () => {
    running -= 1;
    waiting.shift()?.();
  };
  return tasks.map(async (task) => {
    await slot();
    try {
      return await task();
    } finally {
      free();
    }
  });
}

/** File-changing tools, and the arguments that name what they change */
const CHANGES: Record<string, string[]> = {
  write_file: ["path"],
  edit_file: ["path"],
  append_file: ["path"],
  delete_file: ["path"],
  move_file: ["source", "destination"],
};

/** A path as claims compare it: one slash style, no "./", case kept */
export function claimKey(path: string, folder?: string): string {
  let key = path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  key = key.replace(/(^|\/)\.\//g, "$1");
  const absolute = /^([a-z]:)?\//i.test(key);
  if (!absolute && folder) {
    key = `${folder.replace(/\\/g, "/").replace(/\/+$/, "")}/${key}`;
  }
  // Windows paths: one drive-letter case
  return /^[a-z]:\//i.test(key) ? key[0]!.toLowerCase() + key.slice(1) : key;
}

/** The files a call would change, as claim keys; empty for any other call */
export function changedPaths(
  tool: string,
  args: Record<string, unknown>,
  folder?: string
): string[] {
  return (CHANGES[tool] ?? [])
    .map((name) => args[name])
    .filter((value): value is string => typeof value === "string" && !!value)
    .map((value) => claimKey(value, folder));
}

/**
 * Which running agent is changing which file. The first agent to change a
 * file holds it until its run ends; another agent's change to it is
 * refused, so two coders never write over each other's work.
 */
export class FileClaims {
  private owners = new Map<string, { runId: string; role: string }>();

  /**
   * Claims the call's files for this run. Returns why it may not change
   * them, or null when it may (and now holds them).
   */
  claim(
    runId: string,
    role: string,
    tool: string,
    args: Record<string, unknown>,
    folder?: string
  ): string | null {
    const paths = changedPaths(tool, args, folder);
    for (const path of paths) {
      const owner = this.owners.get(path);
      if (owner && owner.runId !== runId) {
        const name = path.split("/").pop() ?? path;
        return `Not run: ${name} is being changed by the ${owner.role} working on another task at the same time. Leave that file to it: work on your own files, or say in your report that you need ${name} changed.`;
      }
    }
    for (const path of paths) this.owners.set(path, { runId, role });
    return null;
  }

  /** The run ended: its files are free */
  release(runId: string): void {
    for (const [path, owner] of [...this.owners]) {
      if (owner.runId === runId) this.owners.delete(path);
    }
  }
}
