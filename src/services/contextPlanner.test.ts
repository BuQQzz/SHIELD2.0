// @vitest-environment node
import { describe, it, expect } from "vitest";
import { planUnsizedServerContext } from "./contextPlanner";

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
