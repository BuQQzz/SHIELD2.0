/**
 * System memory check before loading a model (main process only)
 *
 * Models that do not fit in VRAM run partly from system RAM. Loading one
 * with too little headroom either pages everything to disk or - when the
 * Windows commit limit runs out - makes allocations fail, which crashed the
 * renderer on 2026-09-24. This estimates what a model needs, compares it
 * with what is free, and says so in numbers.
 */

import { execFile } from "child_process";
import os from "os";

export interface MemoryNeed {
  /** System RAM the model keeps resident while running */
  ramBytes: number;
  /** Windows commit charge (private memory) the load adds */
  commitBytes: number;
}

export interface SystemMemory {
  /** RAM available now, including the reclaimable standby list */
  ramFreeBytes: number;
  /** Commit limit minus committed; undefined where it cannot be read */
  commitFreeBytes?: number;
}

export interface MemoryCheck {
  ok: boolean;
  need: MemoryNeed;
  /** Free memory, counting what the loaded model gives back on unload */
  free: SystemMemory;
  /** Plain-language reasons, empty when ok */
  problems: string[];
}

const GB = 1024 ** 3;

/** Kept free for Windows, SHIELD itself and the apps around it */
export const RAM_MARGIN_BYTES = 2 * GB;
export const COMMIT_MARGIN_BYTES = 2 * GB;

/**
 * GPU memory llama-server's `--fit` keeps back from the weights: its safety
 * margin plus compute buffers at `-ub 2048` and the CUDA runtime. Calibrated
 * on Qwen3-Coder-30B Q4_K_M, 32k context, RTX 4070 12 GB: ~12 GB resident.
 */
const SERVER_GPU_RESERVE_BYTES = 3 * GB;
/**
 * Commit on top of the weights for llama-server with `--load-mode none`,
 * which reads every weight into private memory: 18.6 GB of Qwen3-Coder
 * committed ~22 GB. Revisit if the launch profile moves to mmap.
 */
const SERVER_COMMIT_OVERHEAD_BYTES = 3.5 * GB;
/**
 * Commit for node-llama-cpp beyond its context buffers. Its weights are
 * memory-mapped - backed by the file, not the commit limit.
 */
const NODE_COMMIT_OVERHEAD_BYTES = 1 * GB;

/** llama-server keeps attention and the cache on the GPU, experts in RAM */
export function serverMemoryNeed(options: {
  modelBytes: number;
  vramTotalBytes: number;
  contextVramBytes: number;
}): MemoryNeed {
  const gpuWeights = Math.max(
    0,
    options.vramTotalBytes - options.contextVramBytes - SERVER_GPU_RESERVE_BYTES
  );
  return {
    ramBytes: Math.max(0, options.modelBytes - gpuWeights),
    commitBytes: options.modelBytes + SERVER_COMMIT_OVERHEAD_BYTES,
  };
}

/** node-llama-cpp: whole layers on the CPU, weights memory-mapped */
export function nodeMemoryNeed(options: {
  modelCpuRamBytes: number;
  contextCpuRamBytes: number;
}): MemoryNeed {
  return {
    ramBytes: options.modelCpuRamBytes + options.contextCpuRamBytes,
    commitBytes: options.contextCpuRamBytes + NODE_COMMIT_OVERHEAD_BYTES,
  };
}

/** "12 GB", "0.8 GB" */
export function formatGB(bytes: number): string {
  const gb = bytes / GB;
  return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
}

/**
 * Compare a model's need with free memory. `held` is what the model loaded
 * now uses; it is unloaded first, so it counts as free.
 */
export function assessMemory(
  need: MemoryNeed,
  system: SystemMemory,
  held: MemoryNeed = { ramBytes: 0, commitBytes: 0 }
): MemoryCheck {
  const free: SystemMemory = {
    ramFreeBytes: system.ramFreeBytes + held.ramBytes,
    commitFreeBytes:
      system.commitFreeBytes === undefined
        ? undefined
        : system.commitFreeBytes + held.commitBytes,
  };

  const problems: string[] = [];
  if (need.ramBytes + RAM_MARGIN_BYTES > free.ramFreeBytes) {
    problems.push(
      `Needs ~${formatGB(need.ramBytes)} of RAM, ${formatGB(free.ramFreeBytes)} free. ` +
        "Windows will move memory to disk, so the model and other apps can slow to a crawl."
    );
  }
  if (
    free.commitFreeBytes !== undefined &&
    need.commitBytes + COMMIT_MARGIN_BYTES > free.commitFreeBytes
  ) {
    problems.push(
      `Needs ~${formatGB(need.commitBytes)} of virtual memory, ${formatGB(free.commitFreeBytes)} available. ` +
        "When it runs out, loading fails or SHIELD crashes. A larger page file raises the limit."
    );
  }
  return { ok: problems.length === 0, need, free, problems };
}

/** Free RAM and, on Windows, free commit. Never throws. */
export async function readSystemMemory(): Promise<SystemMemory> {
  return {
    ramFreeBytes: os.freemem(),
    commitFreeBytes:
      process.platform === "win32" ? await readFreeCommit() : undefined,
  };
}

function readFreeCommit(): Promise<number | undefined> {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory",
      ],
      { windowsHide: true, timeout: 10_000 },
      (error, stdout) => {
        // Kilobytes
        const kb = Number(stdout.trim());
        resolve(
          error || !Number.isFinite(kb) || kb <= 0 ? undefined : kb * 1024
        );
      }
    );
  });
}
