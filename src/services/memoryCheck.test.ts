// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assessMemory,
  formatGB,
  nodeMemoryNeed,
  serverMemoryNeed,
} from "./memoryCheck";

const GB = 1024 ** 3;

describe("serverMemoryNeed", () => {
  // Measured 2026-09-24: ~12 GB resident, ~22 GB (decimal) committed
  const qwen3Coder = serverMemoryNeed({
    modelBytes: 17.28 * GB,
    vramTotalBytes: 12 * GB,
    contextVramBytes: 3 * GB,
  });

  it("keeps in RAM what does not fit on the GPU", () => {
    expect(qwen3Coder.ramBytes / GB).toBeCloseTo(11.3, 1);
  });

  it("commits every weight with --load-mode none", () => {
    expect(qwen3Coder.commitBytes).toBeGreaterThan(17.28 * GB);
    expect(qwen3Coder.commitBytes / 1e9).toBeCloseTo(22.3, 0);
  });

  it("needs no RAM for weights that fit on the GPU", () => {
    const small = serverMemoryNeed({
      modelBytes: 4 * GB,
      vramTotalBytes: 12 * GB,
      contextVramBytes: 1 * GB,
    });
    expect(small.ramBytes).toBe(0);
  });
});

describe("nodeMemoryNeed", () => {
  it("counts CPU layers as RAM but not as commit (memory-mapped)", () => {
    const need = nodeMemoryNeed({
      modelCpuRamBytes: 8 * GB,
      contextCpuRamBytes: 1 * GB,
    });
    expect(need.ramBytes).toBe(9 * GB);
    expect(need.commitBytes).toBeLessThan(3 * GB);
  });
});

describe("assessMemory", () => {
  const need = { ramBytes: 12 * GB, commitBytes: 21 * GB };

  it("passes with room to spare", () => {
    const check = assessMemory(need, {
      ramFreeBytes: 20 * GB,
      commitFreeBytes: 40 * GB,
    });
    expect(check.ok).toBe(true);
    expect(check.problems).toEqual([]);
  });

  it("says how much RAM is needed and free", () => {
    const check = assessMemory(need, {
      ramFreeBytes: 9 * GB,
      commitFreeBytes: 40 * GB,
    });
    expect(check.ok).toBe(false);
    expect(check.problems).toHaveLength(1);
    expect(check.problems[0]).toContain("Needs ~12 GB of RAM, 9 GB free");
  });

  it("flags too little commit, which crashes rather than slows", () => {
    const check = assessMemory(need, {
      ramFreeBytes: 20 * GB,
      commitFreeBytes: 15 * GB,
    });
    expect(check.ok).toBe(false);
    expect(check.problems[0]).toMatch(/virtual memory.*15 GB available/);
  });

  it("keeps a margin for Windows and other apps", () => {
    const check = assessMemory(need, {
      ramFreeBytes: 13 * GB,
      commitFreeBytes: 40 * GB,
    });
    expect(check.ok).toBe(false);
  });

  it("counts the loaded model as free, since it is unloaded first", () => {
    const check = assessMemory(
      need,
      { ramFreeBytes: 3 * GB, commitFreeBytes: 22 * GB },
      need
    );
    expect(check.ok).toBe(true);
  });

  it("skips the commit check where commit cannot be read", () => {
    const check = assessMemory(need, { ramFreeBytes: 20 * GB });
    expect(check.ok).toBe(true);
  });
});

describe("formatGB", () => {
  it("rounds large sizes to whole GB and small ones to a tenth", () => {
    expect(formatGB(12.4 * GB)).toBe("12 GB");
    expect(formatGB(0.84 * GB)).toBe("0.8 GB");
  });
});
