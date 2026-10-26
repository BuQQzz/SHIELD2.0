import { describe, expect, it } from "vitest";
import { withSteer } from "./steer";

describe("withSteer", () => {
  it("leaves a result alone when the user sent nothing", () => {
    expect(withSteer("<tool_result>ok</tool_result>", [])).toBe(
      "<tool_result>ok</tool_result>"
    );
  });

  it("adds the user's messages after the result, in order", () => {
    const text = withSteer("<tool_result>ok</tool_result>", [
      "use pytest",
      "and keep it short",
    ]);
    expect(text.startsWith("<tool_result>ok</tool_result>\n\n")).toBe(true);
    expect(text).toContain(
      '[The user sent this while you were working: "use pytest", then "and keep it short".'
    );
  });
});
