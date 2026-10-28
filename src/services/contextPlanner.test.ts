// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  planUnsizedServerContext,
  recommendContextSize,
  type ContextOption,
} from "./contextPlanner";

const plan = (layers: number[]): ContextOption[] =>
  layers.map((gpuLayers, i) => ({ contextSize: 8192 * 2 ** i, gpuLayers }));

// Layer counts estimated for an RTX 4070 (12 GB), 8k to 256k
describe("recommendContextSize", () => {
  it("gives up at most 10% of the GPU layers for a bigger window", () => {
    // Qwen3-Coder-30B (49 layers, partly in RAM)
    expect(recommendContextSize(plan([29, 28, 26, 22, 17, 12]))).toBe(32768);
  });

  it("keeps a model that fits on the GPU nearly all on it", () => {
    // Qwen3.8-27B IQ3_XXS (66 layers): 16k costs one layer, 32k eight
    expect(recommendContextSize(plan([66, 65, 58, 47, 35, 22]))).toBe(16384);
  });

  it("goes up to the trained context when it all fits", () => {
    // Gemma 4 12B, sliding-window attention, trained for 128k
    expect(recommendContextSize(plan([49, 49, 49, 49, 49]))).toBe(131072);
  });

  it("stops at the first size that breaks the rule", () => {
    expect(recommendContextSize(plan([20, 20, 10, 20]))).toBe(16384);
  });

  it("falls back to the smallest size", () => {
    expect(recommendContextSize(plan([5, 1]))).toBe(8192);
    expect(recommendContextSize([])).toBe(8192);
  });
});

describe("planUnsizedServerContext", () => {
  const info = (contextLength?: number) => ({
    metadata: {
      general: { architecture: "qwen35" },
      qwen35: { context_length: contextLength, block_count: 32 },
    },
  });

  it("offers and recommends the catalog's size when it is not a step", () => {
    const plan = planUnsizedServerContext(info(262144) as never, 24576);
    expect(plan.options.map((o) => o.contextSize)).toEqual([
      8192, 16384, 24576, 32768, 65536,
    ]);
    expect(plan.recommended).toBe(24576);
  });

  it("offers sizes up to 64k with no memory estimate, so loads go unchecked", () => {
    const plan = planUnsizedServerContext(info(262144) as never, 32768);
    expect(plan.options.map((o) => o.contextSize)).toEqual([
      8192, 16384, 32768, 65536,
    ]);
    expect(plan.options.every((o) => o.memory === undefined)).toBe(true);
    expect(plan.totalLayers).toBe(32);
    expect(plan.trainContextSize).toBe(262144);
  });

  it("recommends the model's preferred size when offered, else the largest", () => {
    expect(
      planUnsizedServerContext(info(262144) as never, 32768).recommended
    ).toBe(32768);
    expect(
      planUnsizedServerContext(info(16384) as never, 32768).recommended
    ).toBe(16384);
  });

  it("falls back to 32k when the file states no context length", () => {
    const plan = planUnsizedServerContext(info(undefined) as never, 32768);
    expect(plan.trainContextSize).toBe(32768);
    expect(plan.recommended).toBe(32768);
  });
});
