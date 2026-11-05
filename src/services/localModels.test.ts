import { describe, expect, it, vi } from "vitest";

vi.mock("node-llama-cpp", () => ({ getLlama: vi.fn() }));

import { nominalGB } from "./localModels";

describe("nominalGB", () => {
  it("reads memory as the size it is sold as", () => {
    // RTX 2070 SUPER under the Linux driver: 7.6 GiB of 8
    expect(nominalGB(7.6018 * 2 ** 30)).toBe(8);
    expect(nominalGB(11.6 * 2 ** 30)).toBe(12);
    // 16 GB of system RAM on the same PC
    expect(nominalGB(15.52 * 2 ** 30)).toBe(16);
  });
});
