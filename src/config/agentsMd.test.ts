import { describe, expect, it } from "vitest";
import { draftNote, instructionsSection, isAgentsMd } from "./agentsMd";

describe("AGENTS.md", () => {
  it("recognises the file by name, in any folder", () => {
    expect(isAgentsMd("AGENTS.md")).toBe(true);
    expect(isAgentsMd(String.raw`C:\Projects\EXPERIMENT\AGENTS.md`)).toBe(true);
    expect(isAgentsMd("docs/agents.md")).toBe(true);
    expect(isAgentsMd("MY_AGENTS.md")).toBe(false);
    expect(isAgentsMd("AGENTS.md.bak")).toBe(false);
  });

  it("asks for a short guide from the facts only", () => {
    const note = draftNote("package.json: name cart");
    expect(note).toMatch(/^\[SHIELD: the user asked for an AGENTS\.md/);
    expect(note).toContain("Use only the facts below");
    expect(note).toContain("## Build, Test and Run");
    expect(note).toContain("package.json: name cart");
    expect(note.endsWith("]")).toBe(true);
  });

  it("puts the project's instructions in the prompt under the user's word", () => {
    expect(instructionsSection("  ")).toBe("");
    const section = instructionsSection("Run tests with node test.js");
    expect(section).toContain(
      "## Project instructions (the project's AGENTS.md)"
    );
    expect(section).toContain(
      "the user's own requests and SHIELD's rules come first"
    );
    expect(section).toContain("Run tests with node test.js");
  });
});
