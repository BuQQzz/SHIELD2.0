// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assessMemory, nodeMemoryNeed, serverMemoryNeed } from "./memoryCheck";

const GB = 1024 ** 3;

describe("serverMemoryNeed", () => {
  // Qwen3-Coder-30B Q4_K_M on an RTX 4070, measured 2026-09-24:
  // 32k - 11.6 GiB resident, 21.8 GiB committed
  // 16k - 10.0 GiB resident, 20.3 GiB committed
  const at = (contextVramGB: number) =>
    serverMemoryNeed({
      modelBytes: 17.28 * GB,
      vramTotalBytes: 12 * GB,
      contextVramBytes: contextVramGB * GB,
    });

  it("keeps in RAM what does not fit on the GPU", () => {
    expect(at(3).ramBytes / GB).toBeCloseTo(11.3, 1);
    expect(at(1.5).ramBytes / GB).toBeCloseTo(9.8, 1);
  });

  it("estimates commit at or just above what was measured", () => {
    expect(at(3).commitBytes / GB).toBeGreaterThanOrEqual(21.8);
    expect(at(3).commitBytes / GB).toBeLessThan(23);
    expect(at(1.5).commitBytes / GB).toBeGreaterThanOrEqual(20.3);
    expect(at(1.5).commitBytes / GB).toBeLessThan(21.5);
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

  it("keeps a margin for Windows and other apps, and says so", () => {
    const check = assessMemory(need, {
      ramFreeBytes: 13 * GB,
      commitFreeBytes: 40 * GB,
    });
    expect(check.ok).toBe(false);
    // "Needs 12, 13 free" alone would read as fine
    expect(check.problems[0]).toContain("13 GB free: under 2 GB would be left");
  });

  it("explains a commit margin the same way", () => {
    const check = assessMemory(need, {
      ramFreeBytes: 20 * GB,
      commitFreeBytes: 22 * GB,
    });
    expect(check.ok).toBe(false);
    expect(check.problems[0]).toMatch(/22 GB available: under 2 GB/);
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
