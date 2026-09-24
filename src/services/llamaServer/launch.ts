/**
 * How SHIELD starts llama-server (main process only)
 *
 * The launch profile comes from docs/RUNTIME_SPEED_RESEARCH.md: on a 12 GB
 * GPU it runs Qwen3-Coder-30B at 32k context 3.7-8x faster than
 * node-llama-cpp's whole-layer split.
 */

import fs from "fs";
import os from "os";
import path from "path";

export interface LaunchOptions {
  modelPath: string;
  contextSize: number;
  port: number;
  /** CPU threads for the parts that run in system RAM */
  threads: number;
}

/**
 * - `--fit on`: llama.cpp places tensors to fit the VRAM that is free at
 *   launch, keeping a margin. For MoE models it moves experts, not whole
 *   layers, to system RAM. A fixed placement is risky: when VRAM runs out
 *   the Windows driver silently spills into shared memory and speed
 *   collapses up to 30x instead of failing.
 * - `-ub/-b 2048`: big batches amortise copying RAM-resident experts to the
 *   GPU, 2.8x faster prompt reading.
 * - `--spec-type ngram-mod`: drafts from text already in the context, +65%
 *   on edits (output that repeats a file) at no cost elsewhere.
 * - `-np 1`: one slot, so each turn reuses the previous turn's cache.
 * - `--load-mode none`: read weights into RAM rather than memory-mapping
 *   them, which llama.cpp recommends with experts in RAM (and measured
 *   faster).
 * - `--jinja`: format chats with the model's own template.
 */
export function buildServerArgs(options: LaunchOptions): string[] {
  return [
    "--model",
    options.modelPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(options.port),
    "--ctx-size",
    String(options.contextSize),
    "--parallel",
    "1",
    "--fit",
    "on",
    "--flash-attn",
    "on",
    "--ubatch-size",
    "2048",
    "--batch-size",
    "2048",
    "--threads",
    String(options.threads),
    "--spec-type",
    "ngram-mod",
    "--load-mode",
    "none",
    "--jinja",
    "--no-webui",
  ];
}

/**
 * Threads for CPU-side work. Decode is bound by memory bandwidth, so past
 * about 8 threads more only adds contention (8: 40.0 tok/s, 16: 37.6 on a
 * 12-core Ryzen). Half the logical CPUs, at most 8.
 */
export function defaultThreads(logicalCpus = os.cpus().length): number {
  return Math.max(1, Math.min(8, Math.floor(logicalCpus / 2)));
}

/**
 * Where to find llama-server.exe: `SHIELD_LLAMA_SERVER`, then the Bonsai
 * demo's CUDA build (a llama.cpp fork that is a superset of upstream and
 * also runs Bonsai). Undefined when none exists.
 */
export function findLlamaServer(
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = fs.existsSync
): string | undefined {
  const candidates = [
    env.SHIELD_LLAMA_SERVER,
    path.join(
      os.homedir(),
      "Bonsai",
      "Bonsai-demo",
      "bin",
      "cuda",
      "llama-server.exe"
    ),
  ];
  return candidates.find((file): file is string => !!file && exists(file));
}
