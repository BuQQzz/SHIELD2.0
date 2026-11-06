/**
 * Context size planning (main process only)
 *
 * A bigger context window costs GPU memory. This estimates, per context
 * size, what the cache takes and what moves to system RAM - from the GGUF
 * metadata alone, without loading the model - and recommends a size.
 */

import {
  GgufInsights,
  readGgufFileInfo,
  type GgufFileInfo,
  type Llama,
} from "node-llama-cpp";
import { serverMemoryNeed, type MemoryNeed } from "./memoryCheck.js";

/** Context sizes offered, in tokens */
export const CONTEXT_STEPS = [
  8192, 16384, 32768, 65536, 131072, 262144,
] as const;

/** Used when a model does not state the context it was trained for */
const FALLBACK_MAX_CONTEXT = 32768;

export interface ContextOption {
  contextSize: number;
  /** Layers that fit on the GPU with this context */
  gpuLayers: number;
  /** System memory the model needs at this size */
  memory?: MemoryNeed;
}

export interface ContextPlan {
  trainContextSize: number;
  totalLayers: number;
  /** Ascending by context size, up to the trained context */
  options: ContextOption[];
  recommended: number;
  /**
   * "experts": llama-server keeps every layer's attention on the GPU and
   * moves MoE experts to RAM to fit, so sizes are not a layer trade-off
   */
  placement?: "layers" | "experts";
}

/** Share of VRAM a context may take when llama-server moves experts to fit */
const SERVER_CONTEXT_SHARE = 0.5;

/**
 * Context sizes for a model llama-server runs with `--fit`: attention and
 * the KV cache stay on the GPU and MoE experts move to RAM to make room, so
 * the limit is the context's own VRAM. Offers sizes whose cache takes at
 * most half the GPU; recommends `preferred` (a measured default) when
 * offered, else the largest.
 */
export async function planServerContext(
  modelPath: string,
  llama: Llama,
  vramTotalBytes: number,
  preferred: number,
  /** The file's ServerPlacement puts every layer on the GPU */
  allLayersOnGpu = false
): Promise<ContextPlan> {
  const fileInfo = await readGgufFileInfo(modelPath);
  let insights: GgufInsights;
  try {
    insights = await GgufInsights.from(fileInfo, llama);
  } catch (error) {
    // node-llama-cpp cannot size a format it does not know (Bonsai's PQ2_0);
    // llama-server's --fit places the model, so offer sizes without an estimate
    console.warn(
      `[contextPlanner] Cannot size ${modelPath}, offering unchecked sizes:`,
      error instanceof Error ? error.message : error
    );
    return planUnsizedServerContext(fileInfo, preferred);
  }
  const trainContextSize = insights.trainContextSize ?? FALLBACK_MAX_CONTEXT;
  const totalLayers = insights.totalLayers;

  // The catalog's own size too when it is not a step, as for an unsized
  // model: Qwen3.8 27B IQ1_M is set to 12k on 8 GB (2026-11-05)
  const steps = [...new Set([...CONTEXT_STEPS, preferred])].sort(
    (a, b) => a - b
  );
  const sizes = await Promise.all(
    steps
      .filter((size) => size <= trainContextSize)
      .map(async (contextSize) => {
        const { gpuVram } =
          await insights.estimateContextResourceRequirementsV2({
            contextSize,
            modelGpuLayers: totalLayers,
            flashAttention: true,
          });
        return { contextSize, gpuVram };
      })
  );
  const options = sizes
    .filter(
      ({ gpuVram }, i) =>
        i === 0 || gpuVram <= vramTotalBytes * SERVER_CONTEXT_SHARE
    )
    .map(({ contextSize, gpuVram }) => ({
      contextSize,
      gpuLayers: totalLayers,
      memory: serverMemoryNeed({
        modelBytes: insights.modelSize,
        vramTotalBytes,
        contextVramBytes: gpuVram,
        allLayersOnGpu,
      }),
    }));

  const offered = options.map((o) => o.contextSize);
  return {
    trainContextSize,
    totalLayers,
    options,
    recommended:
      offered.find((size) => size === preferred) ??
      offered.at(-1) ??
      CONTEXT_STEPS[0],
    placement: "experts",
  };
}

/** Largest context offered for a model whose memory use cannot be estimated */
const UNSIZED_MAX_CONTEXT = 65536;

/**
 * A plan for a model node-llama-cpp cannot size. The sizes carry no memory
 * estimate, so the load goes ahead unchecked and llama-server's own `--fit`
 * decides what fits.
 */
export function planUnsizedServerContext(
  fileInfo: Pick<GgufFileInfo, "metadata">,
  preferred: number
): ContextPlan {
  const general = fileInfo.metadata.general as { architecture?: string };
  const arch = general?.architecture;
  const fromFile = arch
    ? (
        fileInfo.metadata as unknown as Record<
          string,
          { context_length?: number }
        >
      )[arch]?.context_length
    : undefined;
  const trainContextSize = fromFile ?? FALLBACK_MAX_CONTEXT;
  const totalLayers =
    (fileInfo.metadata as unknown as Record<string, { block_count?: number }>)[
      arch ?? ""
    ]?.block_count ?? 0;

  const cap = Math.min(trainContextSize, UNSIZED_MAX_CONTEXT);
  // The catalog's own size too when it is not a step: Ternary Bonsai 2 27B
  // is set to 24k for an 8 GB GPU, and without it the plan fell back to its
  // largest step, 64k, which ran out of memory (2026-10-28)
  const sizes = [
    ...new Set([...CONTEXT_STEPS, ...(preferred <= cap ? [preferred] : [])]),
  ]
    .filter((size) => size <= cap)
    .sort((a, b) => a - b);
  const options: ContextOption[] = sizes.map((contextSize) => ({
    contextSize,
    gpuLayers: totalLayers,
  }));
  const offered = options.map((o) => o.contextSize);

  return {
    trainContextSize,
    totalLayers,
    options,
    recommended:
      offered.find((size) => size === preferred) ??
      offered.at(-1) ??
      CONTEXT_STEPS[0],
    placement: "layers",
  };
}
