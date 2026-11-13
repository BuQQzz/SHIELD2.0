import { describe, expect, it } from "vitest";
import { appendToFile } from "./appendFile";

/** A file kept in memory, as the tool's deps see it */
function file(initial: string | null) {
  const state = { text: initial };
  return {
    state,
    deps: {
      read: async () => state.text,
      append: async (_target: string, text: string) => {
        state.text = (state.text ?? "") + text;
      },
    },
  };
}

describe("appendToFile", () => {
  it("adds a section after a blank line and keeps everything already there", async () => {
    const { state, deps } = file("# Checklists\n\n- Water\n");
    const result = await appendToFile(
      "/p/Checklists.md",
      "## Long Island, NY\n- 211 Long Island",
      deps
    );
    expect(result.success).toBe(true);
    expect(state.text).toBe(
      "# Checklists\n\n- Water\n\n## Long Island, NY\n- 211 Long Island\n"
    );
    expect(JSON.stringify(result.data)).toContain("3 existing lines");
  });

  it("starts a line of its own on a file with no final line break", async () => {
    const { state, deps } = file("- Water");
    await appendToFile("/p/a.md", "- Food\n", deps);
    expect(state.text).toBe("- Water\n- Food\n");
  });

  it("creates nothing: a missing file is left to write_file", async () => {
    const { state, deps } = file(null);
    const result = await appendToFile("/p/new.md", "text", deps);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/use write_file/);
    expect(state.text).toBeNull();
  });

  it("refuses the file sent again, which would leave it there twice", async () => {
    const original =
      "# Disaster Preparedness Checklists & Resources\n\n## Overview of Preparedness Levels\n\n| Level | Duration | Focus |\n|---|---|---|\n| 72-Hour Kit | 3 days | Immediate response |\n";
    const { state, deps } = file(original);
    const result = await appendToFile(
      "/p/Checklists.md",
      original + "\n## Long Island, NY\n- 211 Long Island\n",
      deps
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/its first lines.*only the new text/);
    expect(state.text).toBe(original);
  });

  it("refuses empty content", async () => {
    const { deps } = file("x\n");
    expect((await appendToFile("/p/a.md", "  ", deps)).success).toBe(false);
  });
});
