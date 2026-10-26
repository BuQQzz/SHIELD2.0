import { describe, expect, it } from "vitest";
import type { ContextPlan } from "@/types/electron";
import { describeRamUse } from "./ramUse";

const GB = 1024 ** 3;

const plan = (
  recommended: number,
  ram: [contextK: number, ramGB: number][]
): ContextPlan => ({
  trainContextSize: 262144,
  totalLayers: 49,
  recommended,
  options: ram.map(([k, gb]) => ({
    contextSize: k * 1024,
    gpuLayers: 49,
    memory: { ramBytes: gb * GB, commitBytes: 0 },
  })),
});

// Estimates for Qwen3-Coder-30B on llama-server, RTX 4070 12 GB
const qwen3Coder = plan(32768, [
  [8, 9.3],
  [16, 10.4],
  [32, 12],
]);

describe("describeRamUse", () => {
  it("reports the RAM at the recommended context", () => {
    const use = describeRamUse(qwen3Coder);
    expect(use?.contextSize).toBe(32768);
    expect(use?.ramBytes).toBe(12 * GB);
  });

  it("offers the largest smaller context that saves at least 2 GB", () => {
    expect(describeRamUse(qwen3Coder)?.lighter).toEqual({
      contextSize: 8192,
      ramBytes: 9.3 * GB,
    });
  });

  it("follows the user's context choice", () => {
    const use = describeRamUse(qwen3Coder, 16384);
    expect(use?.ramBytes).toBe(10.4 * GB);
    // 8K saves only 1.1 GB more
    expect(use?.lighter).toBeUndefined();
  });

  it("stays quiet for a model that fits on the GPU", () => {
    expect(describeRamUse(plan(8192, [[8, 0.3]]))).toBeNull();
  });

  it("stays quiet when the plan has no memory estimate", () => {
    const old: ContextPlan = {
      trainContextSize: 8192,
      totalLayers: 10,
      recommended: 8192,
      options: [{ contextSize: 8192, gpuLayers: 5 }],
    };
    expect(describeRamUse(old)).toBeNull();
  });
});
