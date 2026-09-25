/**
 * Context size planning (main process only)
 *
 * A bigger context window costs GPU memory that the model's layers would
 * otherwise use, and every layer moved to system RAM slows generation. This
 * estimates, per context size, how many layers stay on the GPU - from the
 * GGUF metadata alone, without loading the model - and recommends a size.
 */

import { GgufInsights, readGgufFileInfo, type Llama } from "node-llama-cpp";
import {
  nodeMemoryNeed,
  serverMemoryNeed,
  type MemoryNeed,
} from "./memoryCheck.js";

/** Context sizes offered, in tokens */
export const CONTEXT_STEPS = [
  8192, 16384, 32768, 65536, 131072, 262144,
] as const;

/** Used when a model does not state the context it was trained for */
const FALLBACK_MAX_CONTEXT = 32768;

/** Share of its GPU layers a model may give up for a bigger window */
const LAYER_BUDGET = 0.9;

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

/**
 * The largest context that keeps at least 90% of the GPU layers the model
 * has at the smallest size - a bigger window is worth a little speed, not
 * a lot. Stops at the first size that breaks the rule.
 */
export function recommendContextSize(options: ContextOption[]): number {
  const base = options[0];
  if (!base) return CONTEXT_STEPS[0];

  const minLayers = Math.floor(base.gpuLayers * LAYER_BUDGET);
  let recommended = base.contextSize;
  for (const option of options.slice(1)) {
    if (option.gpuLayers < minLayers) break;
    recommended = option.contextSize;
  }
  return recommended;
}

/**
 * Estimate each context size for the model file on this GPU.
 *
 * Computed directly - the most layers whose weights plus the context fit
 * in VRAM - rather than with node-llama-cpp's configuration resolver, which
 * gave Qwen3-Coder (MoE) anywhere from 15 to 30 layers at 8k between runs.
 * Uses the total VRAM, not what is free right now: the GPU is shared with
 * other apps, and a recommendation should not change from minute to minute.
 */
export async function planContext(
  modelPath: string,
  llama: Llama,
  vramTotalBytes: number
): Promise<ContextPlan> {
  const insights = await GgufInsights.from(
    await readGgufFileInfo(modelPath),
    llama
  );
  const trainContextSize = insights.trainContextSize ?? FALLBACK_MAX_CONTEXT;
  const totalLayers = insights.totalLayers;
  const budget = vramTotalBytes - llama.vramPaddingSize;

  const fits = async (contextSize: number, gpuLayers: number) => {
    const [model, context] = await Promise.all([
      insights.estimateModelResourceRequirementsV2({ gpuLayers }),
      insights.estimateContextResourceRequirementsV2({
        contextSize,
        modelGpuLayers: gpuLayers,
      }),
    ]);
    return model.gpuVram + context.gpuVram <= budget;
  };

  // Largest layer count that fits; more layers never need less memory
  const maxGpuLayers = async (contextSize: number) => {
    let low = 0;
    let high = totalLayers;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (await fits(contextSize, mid)) low = mid;
      else high = mid - 1;
    }
    return low;
  };

  // What stays in system RAM at a size: the layers that did not fit
  const memoryAt = async (contextSize: number, gpuLayers: number) => {
    const [model, context] = await Promise.all([
      insights.estimateModelResourceRequirementsV2({ gpuLayers }),
      insights.estimateContextResourceRequirementsV2({
        contextSize,
        modelGpuLayers: gpuLayers,
      }),
    ]);
    return nodeMemoryNeed({
      modelCpuRamBytes: model.cpuRam,
      contextCpuRamBytes: context.cpuRam,
    });
  };

  const options: ContextOption[] = await Promise.all(
    CONTEXT_STEPS.filter((size) => size <= trainContextSize).map(
      async (contextSize) => {
        const gpuLayers = await maxGpuLayers(contextSize);
        return {
          contextSize,
          gpuLayers,
          memory: await memoryAt(contextSize, gpuLayers),
        };
      }
    )
  );

  return {
    trainContextSize,
    totalLayers,
    options,
    recommended: recommendContextSize(options),
    placement: "layers",
  };
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
  preferred: number
): Promise<ContextPlan> {
  const insights = await GgufInsights.from(
    await readGgufFileInfo(modelPath),
    llama
  );
  const trainContextSize = insights.trainContextSize ?? FALLBACK_MAX_CONTEXT;
  const totalLayers = insights.totalLayers;

  const sizes = await Promise.all(
    CONTEXT_STEPS.filter((size) => size <= trainContextSize).map(
      async (contextSize) => {
        const { gpuVram } =
          await insights.estimateContextResourceRequirementsV2({
            contextSize,
            modelGpuLayers: totalLayers,
            flashAttention: true,
          });
        return { contextSize, gpuVram };
      }
    )
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
