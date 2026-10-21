import { describe, expect, it } from "vitest";
import { unbackedRoleNote } from "./teamClaims";

const ran = (...roles: ("coder" | "tester" | "reviewer")[]) =>
  roles.map((role) => ({ role }));

describe("unbackedRoleNote", () => {
  // The live case
  it("flags a tester credited with work when only a coder and a reviewer ran", () => {
    const answer =
      "I fixed it. The tester ran python3 test_calc.py and confirmed that the script exits with code 0. The reviewer reviewed the changes.";
    expect(unbackedRoleNote(answer, ran("coder", "reviewer"))).toBe(
      "SHIELD's record: no tester was delegated for this request, so what the answer says that agent did was not done by one."
    );
  });

  it("says nothing when every role the answer credits ran", () => {
    expect(
      unbackedRoleNote(
        "The coder fixed it, the tester confirmed it, and the reviewer approved.",
        ran("coder", "tester", "reviewer")
      )
    ).toBe("");
  });

  it("names every role credited without a run", () => {
    expect(
      unbackedRoleNote(
        "The tester verified it and the reviewer confirmed it.",
        []
      )
    ).toContain("no tester or no reviewer");
  });

  it("does not take a question or an offer for a claim", () => {
    expect(
      unbackedRoleNote(
        "Would you like the tester to run it? I can have a reviewer look.",
        ran("coder")
      )
    ).toBe("");
    expect(unbackedRoleNote("No tester was needed here.", ran("coder"))).toBe(
      ""
    );
  });
});
