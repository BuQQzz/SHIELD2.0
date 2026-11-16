import { describe, expect, it } from "vitest";
import { briefOf } from "./agentRunner";
import { describeWork, parseHandoff } from "./handoff";
import type { AgentReport } from "./types";

const report = (summary: string, brief?: string): AgentReport => ({
  role: "coder",
  status: "DONE",
  handoffId: "h1",
  summary,
  parsed: {
    found: true,
    status: "DONE",
    done: "",
    inProgress: "",
    next: "",
    notes: "",
    ...(brief ? { brief } : {}),
  },
  work: { files: [], commands: [], refused: [] },
  steps: 1,
  contextPercent: 1,
});

describe("an agent's brief", () => {
  it("reads the SUMMARY line of a hand-off", () => {
    const parsed = parseHandoff(
      "Long text.\n\nHANDOFF\nSTATUS: DONE\nSUMMARY: Renamed c_to_f; tests pass.\nDONE: renamed"
    );
    expect(parsed.brief).toBe("Renamed c_to_f; tests pass.");
    expect(parseHandoff("HANDOFF\nSTATUS: DONE").brief).toBeUndefined();
  });

  it("prefers the agent's own summary", () => {
    expect(briefOf(report("A long report.", "Short."))).toBe("Short.");
  });

  it("else takes the report's first paragraph, cut at a sentence", () => {
    expect(briefOf(report("First part.\n\nSecond part."))).toBe("First part.");
    const long = `${"Word ".repeat(30).trim()}. ${"More ".repeat(60)}`;
    const brief = briefOf(report(long)) ?? "";
    expect(brief.length).toBeLessThanOrEqual(281);
    expect(brief.endsWith(".")).toBe(true);
    expect(briefOf(report(""))).toBeUndefined();
  });
});

describe("piped commands in SHIELD's record", () => {
  it("tells the orchestrator a piped exit code is not the command's", () => {
    const lines = describeWork({
      files: [],
      commands: [
        {
          command: "python3 -m pytest -q | tail -40",
          exitCode: 0,
          suspectLines: 0,
        },
        { command: "python3 -m unittest", exitCode: 0, suspectLines: 0 },
      ],
      refused: [],
    });
    expect(lines[1]).toContain("tail -40 -> exit 0 (piped:");
    expect(lines[1]).toMatch(/python3 -m unittest -> exit 0$/);
  });
});
