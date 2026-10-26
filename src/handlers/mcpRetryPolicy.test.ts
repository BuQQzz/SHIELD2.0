import { describe, expect, it } from "vitest";
import { buildMCPRetryPrompt } from "./mcpRetryPolicy";

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
