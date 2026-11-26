import { describe, expect, it } from "vitest";
import { runProfileFor, runRulesFor } from "./runRules";

describe("runRulesFor", () => {
  it("keeps the turn guards for a local model", () => {
    expect(runRulesFor("qwen3.8-9b")).toEqual({
      profile: "local",
      progressCheckEvery: 10,
      nudgeEachRound: true,
      askOnRepeat: false,
    });
    expect(runProfileFor(undefined)).toBe("local");
  });

  it("lets a cloud model work without them", () => {
    const rules = runRulesFor("remote:exp-1:deepseek-v4.1-flash");
    expect(rules.profile).toBe("cloud");
    expect(rules.progressCheckEvery).toBeUndefined();
    expect(rules.nudgeEachRound).toBe(false);
    expect(rules.askOnRepeat).toBe(true);
  });
});

describe("team limits", () => {
  it("keeps a local team's caps and gives a cloud team room", async () => {
    const { orchestratorRounds } = await import("../agents/delegate");
    const { roleSpec } = await import("../agents/roles");
    const { TeamRun } = await import("../agents/team");
    const { TEAM_LIMITS } = await import("./runRules");

    expect(orchestratorRounds(20)).toBe(12);
    expect(orchestratorRounds(20, "cloud")).toBe(40);
    expect(roleSpec("coder").maxRounds).toBe(20);
    expect(roleSpec("coder", TEAM_LIMITS.cloud.agentScale).maxRounds).toBe(60);
    expect(roleSpec("tester", TEAM_LIMITS.cloud.agentScale).maxCommands).toBe(
      18
    );

    const team = new TeamRun();
    team.beginTurn("cloud");
    expect(team.profile).toBe("cloud");
    team.beginTurn();
    expect(team.profile).toBe("local");
  });
});
