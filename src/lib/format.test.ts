import { describe, expect, it } from "vitest";
import { formatGB, formatTokens } from "./format";

describe("formatTokens", () => {
  it("keeps small counts exact and shortens large ones", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(312)).toBe("312");
    expect(formatTokens(1000)).toBe("1k");
    expect(formatTokens(8192)).toBe("8.2k");
    expect(formatTokens(52_340)).toBe("52.3k");
    expect(formatTokens(262_144)).toBe("262k");
  });
});

describe("formatGB", () => {
  it("rounds large sizes to whole GB and small ones to a tenth", () => {
    expect(formatGB(12.4 * 1024 ** 3)).toBe("12 GB");
    expect(formatGB(0.84 * 1024 ** 3)).toBe("0.8 GB");
  });
});
