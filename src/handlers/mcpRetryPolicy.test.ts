import { describe, expect, it } from "vitest";
import { announcesWithoutActing, buildMCPRetryPrompt } from "./mcpRetryPolicy";

describe("buildMCPRetryPrompt", () => {
  it("defers call syntax to the model's instructions so native and XML models can retry", () => {
    const prompt = buildMCPRetryPrompt("Create a file here", ["write_file"]);
    expect(prompt).toContain(
      "use the tool-call format provided in your instructions"
    );
    expect(prompt).toContain("Allowed tools: write_file.");
    expect(prompt).not.toContain("XML");
    expect(prompt).toContain("inside the folder listed in your instructions");
  });
});

describe("announcesWithoutActing", () => {
  it("takes a short reply that only says what it will do", () => {
    expect(
      announcesWithoutActing(
        'I\'ll add the "Long Island, NY" section to the end of that checklist file, listing those resources and hazards with brief advice for each.'
      )
    ).toBe(true);
    expect(announcesWithoutActing("Let me read the file first.")).toBe(true);
    expect(
      announcesWithoutActing("/home/u/prep-project/Preparedness_Checklists.md")
    ).toBe(true);
    expect(announcesWithoutActing("C:\\work\\notes.md")).toBe(true);
  });

  it("leaves answers, questions and long replies alone", () => {
    expect(announcesWithoutActing("The file has three sections.")).toBe(false);
    expect(
      announcesWithoutActing("I'll add it at the end. Is that the right file?")
    ).toBe(false);
    expect(announcesWithoutActing("I'll explain. " + "x".repeat(700))).toBe(
      false
    );
  });
});
