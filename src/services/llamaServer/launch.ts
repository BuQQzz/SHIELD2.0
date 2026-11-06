/**
 * How SHIELD starts llama-server (main process only)
 *
 * The launch profile comes from docs/archive/RUNTIME_SPEED_RESEARCH.md: on a 12 GB
 * GPU it runs Qwen3-Coder-30B at 32k context 3.7-8x faster than
 * node-llama-cpp's whole-layer split.
 */

import fs from "fs";
import os from "os";
import path from "path";
import type { ServerPlacement } from "../../config/models.js";

export interface LaunchOptions {
  modelPath: string;
  contextSize: number;
  port: number;
  /** CPU threads for the parts that run in system RAM */
  threads: number;
  /**
   * Tokens a thinking model may spend thinking per reply. Off unless set,
   * on purpose: llama-server cuts the thought off at the budget and the
   * model carries on thinking in the visible answer (2026-10-20: a long
   * reasoning list continued in the content, and an orchestrator's chat
   * filled with its own deliberation ending in a literal </think>). A
   * thinking model that spends a whole reply thinking now gets an
   * explanation instead (src/utils/emptyReply.ts).
   */
  reasoningBudget?: number;
  /**
   * Speculative decoding: "ngram-mod" by default, "none" to leave it off.
   * Switched off with SHIELD_SPEC_TYPE=none to test whether it makes the
   * Bonsai 27B server hang (2026-10-21).
   */
  specType?: "ngram-mod" | "none";
  /** A fixed placement instead of `--fit` (ServerPlacement) */
  placement?: ServerPlacement;
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
 *   them, as llama.cpp recommends with experts in RAM. mmap halves the
 *   commit but reads prompts 30-54% slower, decodes up to 38% slower and
 *   keeps the whole file resident (RUNTIME_SPEED_RESEARCH Finding 6).
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
    ...(options.placement?.allLayersOnGpu
      ? ["--fit", "off", "--n-gpu-layers", "all"]
      : ["--fit", "on"]),
    ...(options.placement?.kvCacheType
      ? [
          "--cache-type-k",
          options.placement.kvCacheType,
          "--cache-type-v",
          options.placement.kvCacheType,
        ]
      : []),
    "--flash-attn",
    "on",
    "--ubatch-size",
    String(options.placement?.ubatchSize ?? 2048),
    "--batch-size",
    "2048",
    "--threads",
    String(options.threads),
    ...(options.specType === "none" ? [] : ["--spec-type", "ngram-mod"]),
    "--load-mode",
    "none",
    "--jinja",
    ...(options.reasoningBudget === undefined
      ? []
      : [
          "--reasoning-budget",
          String(options.reasoningBudget),
          "--reasoning-budget-message",
          REASONING_BUDGET_MESSAGE,
        ]),
    "--no-webui",
  ];
}

/** The server's environment: SHIELD's, with CUDA graphs off if the placement says so */
export function serverEnv(
  placement: ServerPlacement | undefined,
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return placement?.cudaGraphs === false
    ? { ...env, GGML_CUDA_DISABLE_GRAPHS: "1" }
    : env;
}

/**
 * Written into the thought when its budget runs out, so the model goes on
 * to act rather than stopping mid-sentence
 */
const REASONING_BUDGET_MESSAGE =
  "\n\nThinking budget reached. Act now on what I have worked out.\n";

/**
 * Threads for CPU-side work. Decode is bound by memory bandwidth, so past
 * about 8 threads more only adds contention (8: 40.0 tok/s, 16: 37.6 on a
 * 12-core Ryzen). Half the logical CPUs, at most 8.
 */
export function defaultThreads(logicalCpus = os.cpus().length): number {
  return Math.max(1, Math.min(8, Math.floor(logicalCpus / 2)));
}

/** SHIELD's own installed build (Settings › Runtime), set by the main process */
let managedServer: () => string | undefined = () => undefined;

export function setManagedServerLookup(lookup: () => string | undefined) {
  managedServer = lookup;
}

/**
 * Where llama-server comes from, in order: `SHIELD_LLAMA_SERVER`, the build
 * SHIELD installed (Settings › Runtime), then the Bonsai demo's CUDA build
 * (a llama.cpp fork that is a superset of upstream and also runs Bonsai).
 */
export function locateLlamaServer(
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = fs.existsSync,
  managed: string | undefined = managedServer()
): { binary: string; source: "env" | "managed" | "bonsai-demo" } | undefined {
  const candidates = [
    { binary: env.SHIELD_LLAMA_SERVER, source: "env" as const },
    { binary: managed, source: "managed" as const },
    {
      binary: path.join(
        os.homedir(),
        "Bonsai",
        "Bonsai-demo",
        "bin",
        "cuda",
        "llama-server.exe"
      ),
      source: "bonsai-demo" as const,
    },
  ];
  const found = candidates.find((c) => !!c.binary && exists(c.binary));
  return found ? { binary: found.binary!, source: found.source } : undefined;
}

/** The llama-server a model load starts; undefined when none exists */
export function findLlamaServer(
  env: NodeJS.ProcessEnv = process.env,
  exists: (file: string) => boolean = fs.existsSync,
  managed: string | undefined = managedServer()
): string | undefined {
  return locateLlamaServer(env, exists, managed)?.binary;
}
