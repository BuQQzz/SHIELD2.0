import { describe, expect, it } from "vitest";
import { effortFor, isThinkingLevel } from "./thinking";
import { deltaThought } from "../services/llamaServer/sse";

describe("thinking levels", () => {
  it("sends every effort to a hosted model, at most high to a local one", () => {
    expect(effortFor("max", true)).toBe("max");
    expect(effortFor("max", false)).toBe("high");
    expect(effortFor("low", false)).toBe("low");
    expect(effortFor("default", true)).toBeUndefined();
    expect(effortFor("instant", true)).toBeUndefined();
  });

  it("knows its levels", () => {
    expect(isThinkingLevel("xhigh")).toBe(true);
    expect(isThinkingLevel("ultra")).toBe(false);
  });
});

describe("deltaThought", () => {
  it("reads thinking under each name it comes in", () => {
    expect(deltaThought({ reasoning_content: "a" })).toBe("a");
    expect(deltaThought({ reasoning: "b" })).toBe("b");
    expect(
      deltaThought({ reasoning_details: [{ text: "c" }, { summary: "d" }] })
    ).toBe("cd");
    expect(deltaThought({ content: "x" })).toBe("");
    expect(deltaThought(undefined)).toBe("");
  });
});
