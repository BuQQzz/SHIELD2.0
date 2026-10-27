import { describe, expect, it } from "vitest";
import { servedLabel } from "./served";

describe("servedLabel", () => {
  it("says zero retention when the route is reported as keeping nothing", () => {
    expect(servedLabel({ provider: "bedrock", zdr: true })).toMatchObject({
      text: "bedrock · zero retention",
      tone: "good",
    });
  });

  it("warns when the route may keep a copy", () => {
    const label = servedLabel({ provider: "fireworks", zdr: false });
    expect(label.text).toBe("fireworks · may keep data");
    expect(label.tone).toBe("warn");
  });

  it("does not claim anything when the provider said nothing", () => {
    expect(servedLabel({})).toMatchObject({
      text: "cloud · retention not reported",
      tone: "unknown",
    });
  });

  it("calls the report the gateway's own, not a guarantee", () => {
    expect(servedLabel({ zdr: true }).title).toMatch(/not a signed guarantee/);
  });
});
