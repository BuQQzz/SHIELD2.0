import { describe, expect, it } from "vitest";
import { cleanTitle, titleFromMessage } from "./titleGenerator";

describe("titleFromMessage", () => {
  it("takes the first six words of the first line", () => {
    expect(
      titleFromMessage(
        "want to create a nice looking website about AI\nand more detail"
      )
    ).toBe("want to create a nice looking...");
  });

  it("keeps a short message whole, without quotes", () => {
    expect(titleFromMessage('  "fix the login bug"  ')).toBe(
      "fix the login bug"
    );
  });

  it("is New Chat when there is nothing to take", () => {
    expect(titleFromMessage("   ")).toBe("New Chat");
    expect(titleFromMessage("")).toBe("New Chat");
  });
});

describe("cleanTitle", () => {
  it("still falls back to New Chat for an empty title", () => {
    expect(cleanTitle("")).toBe("New Chat");
  });
});
