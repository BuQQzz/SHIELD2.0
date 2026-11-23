import { describe, expect, it } from "vitest";
import { runProfileFor, runRulesFor } from "./runRules";

describe("runRulesFor", () => {
  it("keeps the turn guards for a local model", () => {
    expect(runRulesFor("qwen3.8-9b")).toEqual({
      profile: "local",
      progressCheckEvery: 10,
      nudgeEachRound: true,
    });
    expect(runProfileFor(undefined)).toBe("local");
  });

  it("lets a cloud model work without them", () => {
    const rules = runRulesFor("remote:exp-1:deepseek-v4.1-flash");
    expect(rules.profile).toBe("cloud");
    expect(rules.progressCheckEvery).toBeUndefined();
    expect(rules.nudgeEachRound).toBe(false);
  });
});
