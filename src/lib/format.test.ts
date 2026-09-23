import { describe, expect, it } from "vitest";
import { formatTokens } from "./format";

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
