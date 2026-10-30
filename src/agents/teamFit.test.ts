import { describe, expect, it } from "vitest";
import { getModelById } from "@/config/models";
import { shouldTurnTeamOff, teamAvailability, teamLabel } from "./teamFit";

const server = { runtime: "prism-llama-server" as const };

describe("teamAvailability", () => {
  it("has no opinion before a model is chosen", () => {
    expect(teamAvailability(undefined)).toEqual({
      state: "available",
      untested: false,
    });
  });

  it("rules out a model whose runtime cannot run a team", () => {
    const result = teamAvailability({ runtime: "node-llama-cpp" });
    expect(result.state).toBe("unavailable");
  });

  it("allows a model that ran a team, and one nobody has tried", () => {
    expect(
      teamAvailability({ ...server, team: { fit: "good", note: "n" } })
    ).toMatchObject({ state: "available", untested: false });
    expect(teamAvailability(server)).toMatchObject({
      state: "available",
      untested: true,
    });
  });

  it("asks for a caution on a model that failed the check", () => {
    expect(
      teamAvailability({ ...server, team: { fit: "poor", note: "failed" } })
    ).toEqual({ state: "caution", note: "failed" });
  });

  it("matches what the catalog says about the models tried so far", () => {
    expect(teamAvailability(getModelById("bonsai-2-27b"))).toMatchObject({
      state: "available",
      untested: true,
    });
    expect(teamAvailability(getModelById("bonsai-2-9b"))).toMatchObject({
      state: "available",
      untested: true,
    });
    expect(teamAvailability(getModelById("bonsai-8b")).state).toBe("caution");
    // Gemma runs on node-llama-cpp, which has no sub-agent sessions
    expect(teamAvailability(getModelById("gemma-4-12b")).state).toBe(
      "unavailable"
    );
  });
});

describe("shouldTurnTeamOff", () => {
  const caution = { state: "caution", note: "n" } as const;
  const unavailable = { state: "unavailable", reason: "r" } as const;
  const fine = { state: "available", untested: false } as const;

  it("leaves a session with Team off alone", () => {
    expect(shouldTurnTeamOff({ team: false }, "m", caution)).toBe(false);
    expect(shouldTurnTeamOff(null, "m", unavailable)).toBe(false);
  });

  it("turns Team off for a model that cannot run it, whatever the user said", () => {
    expect(
      shouldTurnTeamOff({ team: true, teamOverride: "m" }, "m", unavailable)
    ).toBe(true);
  });

  it("turns Team off for a poor model until the user accepts it for that model", () => {
    expect(shouldTurnTeamOff({ team: true }, "m", caution)).toBe(true);
    expect(
      shouldTurnTeamOff({ team: true, teamOverride: "m" }, "m", caution)
    ).toBe(false);
    // The acceptance was for another model
    expect(
      shouldTurnTeamOff({ team: true, teamOverride: "other" }, "m", caution)
    ).toBe(true);
  });

  it("keeps Team on for a model that is fine", () => {
    expect(shouldTurnTeamOff({ team: true }, "m", fine)).toBe(false);
  });
});

describe("teamLabel", () => {
  it("says what the model card should say for each case", () => {
    expect(
      teamLabel({
        ...getModelById("bonsai-2-27b")!,
        team: { fit: "good", note: "ran" },
      }).label
    ).toBe("Team: works");
    expect(teamLabel(getModelById("bonsai-2-27b")).label).toBe(
      "Team: untested"
    );
    expect(teamLabel(getModelById("bonsai-2-9b")).label).toBe("Team: untested");
    expect(teamLabel(getModelById("bonsai-8b"))).toMatchObject({
      label: "Team: not suited",
      tone: "bad",
    });
    expect(teamLabel(getModelById("gemma-4-12b")).label).toBe(
      "Team: not available"
    );
  });
});
