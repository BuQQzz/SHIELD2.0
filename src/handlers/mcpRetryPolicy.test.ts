import { describe, expect, it } from "vitest";
import {
  announcesWithoutActing,
  buildMCPRetryPrompt,
  endsByAnnouncing,
} from "./mcpRetryPolicy";

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

describe("endsByAnnouncing", () => {
  it("takes a reply whose last sentence names the next step", () => {
    expect(
      endsByAnnouncing(
        "I'll append the new section at the end of the file, matching its existing heading style."
      )
    ).toBe(true);
    expect(
      endsByAnnouncing(
        "I see the file ends with the Pet Supplies section.\n\nI need to append a new section. Let me now create the content"
      )
    ).toBe(true);
    expect(endsByAnnouncing("Let me read it first.")).toBe(true);
  });

  it("leaves answers, questions and earlier announcements alone", () => {
    expect(endsByAnnouncing("Let me know if you want changes.")).toBe(false);
    expect(
      endsByAnnouncing(
        "The write was denied. I'll let the user know it was not completed."
      )
    ).toBe(false);
    expect(endsByAnnouncing("Should I add it at the end?")).toBe(false);
    expect(
      endsByAnnouncing("Let me read the file. Done: the section is added.")
    ).toBe(false);
  });
});
