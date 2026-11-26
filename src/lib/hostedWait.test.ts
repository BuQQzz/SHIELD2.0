import { describe, expect, it } from "vitest";
import { waitText } from "./hostedWait";

describe("a hosted model's wait", () => {
  it("is sending, then thinking or working on the results, with the time", () => {
    expect(waitText("Experiential Labs", false, 1)).toBe(
      "Sending to Experiential Labs…"
    );
    expect(waitText("Experiential Labs", false, 12)).toBe("Thinking · 12s");
    expect(waitText("Experiential Labs", true, 12)).toBe(
      "Working on the results · 12s"
    );
  });

  it("says a long wait is the model thinking", () => {
    expect(waitText("X", false, 52)).toBe(
      "Thinking · 52s · this model thinks before it shows anything"
    );
  });
});
