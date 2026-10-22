import { describe, expect, it } from "vitest";
import {
  checkToolUse,
  isTestFile,
  ORCHESTRATOR_PROMPT,
  roleSpec,
  toolsForRole,
} from "./roles";
import type { ToolDefinition } from "../types/prompts";
import {
  describeWork,
  handoffNote,
  parseHandoff,
  stripHandoff,
} from "./handoff";

describe("isTestFile", () => {
  it.each([
    "test.sh",
    "tests/helpers.py",
    "src/add.test.js",
    "src/add.spec.ts",
    "test_add.py",
    "add_test.go",
    "/home/me/app/__tests__/a.js",
    "C:\\app\\tests\\a.js",
  ])("is a test: %s", (path) => expect(isTestFile(path)).toBe(true));

  it.each([
    "add.sh",
    "src/latest.js",
    "contest.py",
    "src/attestation.ts",
    "README.md",
  ])("is not a test: %s", (path) => expect(isTestFile(path)).toBe(false));
});

describe("checkToolUse", () => {
  const call = (tool: string, args: Record<string, unknown> = {}) => ({
    tool,
    arguments: args,
  });

  it("lets the coder do everything but delegate", () => {
    expect(
      checkToolUse("coder", call("edit_file", { path: "a.js" }))
    ).toBeNull();
    expect(
      checkToolUse("coder", call("write_file", { path: "a.js" }))
    ).toBeNull();
    expect(
      checkToolUse("coder", call("run_command", { command: "npm test" }))
    ).toBeNull();
    expect(checkToolUse("coder", call("delegate"))).toContain("orchestrator");
  });

  it("lets the tester change test files only, and never move or delete", () => {
    expect(
      checkToolUse("tester", call("write_file", { path: "/p/test_add.py" }))
    ).toBeNull();
    expect(
      checkToolUse("tester", call("edit_file", { path: "/p/tests/a.js" }))
    ).toBeNull();
    expect(
      checkToolUse("tester", call("edit_file", { path: "/p/add.py" }))
    ).toContain("not one");
    expect(
      checkToolUse("tester", call("write_file", { path: "/p/latest.js" }))
    ).toContain("not one");
    expect(
      checkToolUse(
        "tester",
        call("move_file", { source: "/p/test.sh", destination: "/p/x" })
      )
    ).toContain("only create or change test files");
    expect(
      checkToolUse("tester", call("delete_file", { path: "/p/test.sh" }))
    ).toContain("only create or change test files");
    expect(
      checkToolUse("tester", call("read_text_file", { path: "/p/add.py" }))
    ).toBeNull();
    expect(
      checkToolUse("tester", call("run_command", { command: "pytest -q" }))
    ).toBeNull();
  });

  it("lets the reviewer read, and run only commands that read", () => {
    expect(
      checkToolUse("reviewer", call("read_text_file", { path: "/p/a.js" }))
    ).toBeNull();
    expect(
      checkToolUse(
        "reviewer",
        call("search_files", { path: "/p", pattern: "x" })
      )
    ).toBeNull();
    expect(
      checkToolUse("reviewer", call("run_command", { command: "git diff" }))
    ).toBeNull();
    expect(
      checkToolUse("reviewer", call("run_command", { command: "npm test" }))
    ).toContain("only run commands that read");
    expect(
      checkToolUse("reviewer", call("write_file", { path: "/p/a.js" }))
    ).toContain("cannot change anything");
    expect(
      checkToolUse("reviewer", call("edit_file", { path: "/p/a.js" }))
    ).toContain("cannot change anything");
  });

  it("treats an unknown tool as a change, as the permission modes do", () => {
    expect(checkToolUse("reviewer", call("mystery_tool"))).toContain(
      "cannot change anything"
    );
    expect(
      checkToolUse("tester", call("mystery_tool", { path: "test.sh" }))
    ).toContain("only create or change test files");
  });

  it("always lets agents leave team notes", () => {
    for (const role of ["coder", "tester", "reviewer"] as const) {
      expect(
        checkToolUse(role, call("add_team_note", { text: "x" }))
      ).toBeNull();
    }
  });
});

describe("roles", () => {
  it("names the role, the checkpoint and the hand-off format in every agent prompt", () => {
    for (const role of ["coder", "tester", "reviewer"] as const) {
      const spec = roleSpec(role);
      expect(spec.prompt).toContain(`the ${role} of a small team`);
      expect(spec.prompt).toContain("[Context: 42% used]");
      expect(spec.prompt).toContain("STATUS: DONE | PARTIAL | BLOCKED");
      expect(spec.maxRounds).toBeGreaterThan(0);
    }
    expect(roleSpec("tester").maxCommands).toBeLessThanOrEqual(
      roleSpec("coder").maxCommands
    );
  });

  // The user (2026-10-22): "the agent replying that it cannot do code or
  // edit files is misleading. it should just work and spawn agents if needed"
  it("keeps the orchestrator from telling the user it cannot touch files", () => {
    expect(ORCHESTRATOR_PROMPT).toContain(
      "never say that you cannot read, edit or run something"
    );
    expect(ORCHESTRATOR_PROMPT).toContain("never mention delegating");
    expect(ORCHESTRATOR_PROMPT).toContain('Say "I"');
  });

  it("tells the orchestrator to delegate only what the request needs", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("never for the sake of it");
    expect(ORCHESTRATOR_PROMPT).toContain("needs no agent: answer it yourself");
    expect(ORCHESTRATOR_PROMPT).toContain("the user's own words");
  });

  it("tells the orchestrator to work through the team, and how to continue a PARTIAL", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("you do not touch files yourself");
    expect(ORCHESTRATOR_PROMPT).toContain("continue_from");
    expect(ORCHESTRATOR_PROMPT).toContain("Checked by SHIELD");
    expect(ORCHESTRATOR_PROMPT).toContain(
      "Never say what a reviewer or tester found"
    );
  });
});

describe("parseHandoff", () => {
  const block = `Fixed it.

HANDOFF
STATUS: PARTIAL
DONE: added add.sh
  wrote test_add.sh
IN PROGRESS: wiring the sub command
NEXT: implement sub in add.sh, then run ./test_add.sh
NOTES: bash 5 only`;

  it("reads every field, including continuation lines", () => {
    expect(parseHandoff(block)).toEqual({
      found: true,
      status: "PARTIAL",
      done: "added add.sh\nwrote test_add.sh",
      inProgress: "wiring the sub command",
      next: "implement sub in add.sh, then run ./test_add.sh",
      notes: "bash 5 only",
    });
  });

  it("is lenient about markdown", () => {
    const parsed = parseHandoff(
      "## HANDOFF\n**STATUS:** done\n**DONE:** all of it\n**NEXT:** nothing"
    );
    expect(parsed).toMatchObject({
      found: true,
      status: "DONE",
      done: "all of it",
      next: "nothing",
    });
  });

  it("takes the last block when there are several", () => {
    const parsed = parseHandoff(
      "HANDOFF\nSTATUS: PARTIAL\nNEXT: a\n\nmore work\n\nHANDOFF\nSTATUS: DONE\nNEXT: b"
    );
    expect(parsed.status).toBe("DONE");
    expect(parsed.next).toBe("b");
  });

  it("reports no block, and an unreadable status, plainly", () => {
    expect(parseHandoff("All done, tests pass.").found).toBe(false);
    expect(
      parseHandoff("HANDOFF\nSTATUS: kind of\nDONE: x").status
    ).toBeUndefined();
  });

  it("strips the block from the reply", () => {
    expect(stripHandoff(block)).toBe("Fixed it.");
    expect(stripHandoff("no block here")).toBe("no block here");
  });
});

describe("handoffNote", () => {
  it("gives a fresh agent the narrative and SHIELD's facts, and warns the notes may be incomplete", () => {
    const note = handoffNote({
      fromRole: "coder",
      status: "PARTIAL",
      parsed: {
        found: true,
        status: "PARTIAL",
        done: "add.sh",
        inProgress: "",
        next: "write sub",
        notes: "",
      },
      work: {
        files: [{ path: "add.sh", action: "written", ok: true }],
        commands: [{ command: "./test.sh", exitCode: 1, suspectLines: 0 }],
        refused: [],
      },
    });
    expect(note).toContain("previous coder stopped with status PARTIAL");
    expect(note).toContain("DONE: add.sh");
    expect(note).toContain("NEXT: write sub");
    expect(note).not.toContain("IN PROGRESS");
    expect(note).toContain("- files: add.sh written");
    expect(note).toContain("./test.sh -> exit 1");
    expect(note).toContain("do not assume the notes are complete");
  });
});

describe("describeWork", () => {
  it("says plainly when nothing was done, and flags failures", () => {
    expect(describeWork({ files: [], commands: [], refused: [] })).toEqual([
      "- files: none changed",
      "- commands: none run",
    ]);
    const lines = describeWork({
      files: [{ path: "a.js", action: "edited", ok: false }],
      commands: [{ command: "npm test", exitCode: 0, suspectLines: 2 }],
      refused: ["tester may only change test files"],
    });
    expect(lines[0]).toBe("- files: a.js edited (FAILED)");
    expect(lines[1]).toContain("exit 0 (2 output lines looked like failures)");
    expect(lines[2]).toContain("refused: tester may only change test files");
  });
});

describe("toolsForRole", () => {
  const def = (name: string): ToolDefinition => ({
    name,
    description: name,
    serverName: "filesystem",
    parameters: [],
  });
  const ALL = [
    "read_text_file",
    "list_directory",
    "search_files",
    "write_file",
    "edit_file",
    "create_directory",
    "move_file",
    "delete_file",
    "run_command",
    "web_search",
    "search_memory",
    "update_plan",
    "delegate",
  ].map(def);
  const namesFor = (role: "coder" | "tester" | "reviewer") =>
    toolsForRole(role, ALL).map((t) => t.name);

  it("never shows workers the orchestrator's or the chat's tools", () => {
    for (const role of ["coder", "tester", "reviewer"] as const) {
      for (const hidden of [
        "delegate",
        "update_plan",
        "web_search",
        "search_memory",
      ]) {
        expect(namesFor(role)).not.toContain(hidden);
      }
    }
  });

  it("shows the coder every project tool", () => {
    expect(namesFor("coder")).toEqual([
      "read_text_file",
      "list_directory",
      "search_files",
      "write_file",
      "edit_file",
      "create_directory",
      "move_file",
      "delete_file",
      "run_command",
    ]);
  });

  it("shows the tester what it may use: reads, test-file writes, commands", () => {
    expect(namesFor("tester")).toEqual([
      "read_text_file",
      "list_directory",
      "search_files",
      "write_file",
      "edit_file",
      "create_directory",
      "run_command",
    ]);
  });

  it("shows the reviewer reads and commands only", () => {
    expect(namesFor("reviewer")).toEqual([
      "read_text_file",
      "list_directory",
      "search_files",
      "run_command",
    ]);
  });
});
