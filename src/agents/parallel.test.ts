import { describe, expect, it } from "vitest";
import {
  claimKey,
  changedPaths,
  FileClaims,
  inPool,
  MAX_PARALLEL_AGENTS,
  parallelAgentsFor,
} from "./parallel";
import { orchestratorPrompt } from "./roles";
import { TeamRun } from "./team";

describe("parallelAgentsFor", () => {
  it("lets a hosted model's agents work together, a local one's take turns", () => {
    expect(parallelAgentsFor("remote:exp-1:deepseek-v4.1-flash")).toBe(
      MAX_PARALLEL_AGENTS
    );
    expect(parallelAgentsFor("bonsai-2-27b")).toBe(1);
    expect(parallelAgentsFor(undefined)).toBe(1);
  });

  it("tells the orchestrator only when its agents can work together", () => {
    expect(orchestratorPrompt(1)).toContain("Delegate one step at a time.");
    expect(orchestratorPrompt(4)).toContain("they run together, up to 4");
    expect(orchestratorPrompt(4)).not.toContain("Delegate one step at a time.");
  });
});

describe("inPool", () => {
  it("runs at most the limit at once, and gives each result in order", async () => {
    let running = 0;
    let most = 0;
    const release: (() => void)[] = [];
    const tasks = [1, 2, 3, 4, 5].map((n) => async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise<void>((r) => release.push(r));
      running -= 1;
      return n * 10;
    });
    const results = inPool(tasks, 2);
    let done = false;
    const all = Promise.all(results).then((r) => {
      done = true;
      return r;
    });
    while (!done) {
      await new Promise((r) => setTimeout(r, 0));
      release.shift()?.();
    }
    expect(await all).toEqual([10, 20, 30, 40, 50]);
    expect(most).toBe(2);
  });
});

describe("file claims", () => {
  it("compares paths in one form", () => {
    expect(claimKey("./src/a.ts", "/p")).toBe("/p/src/a.ts");
    expect(claimKey("C:\\p\\a.ts")).toBe("c:/p/a.ts");
    expect(
      changedPaths("move_file", { source: "a", destination: "b" }, "/p")
    ).toEqual(["/p/a", "/p/b"]);
    expect(changedPaths("read_text_file", { path: "a" }, "/p")).toEqual([]);
  });

  it("keeps a file to the agent changing it until its run ends", () => {
    const claims = new FileClaims();
    const write = (path: string) => ({ path, content: "x" });
    expect(claims.claim("h1", "coder", "write_file", write("a.py"), "/p")).toBe(
      null
    );
    // The same agent again, and another agent's own file, are fine
    expect(
      claims.claim("h1", "coder", "edit_file", write("/p/a.py"), "/p")
    ).toBe(null);
    expect(claims.claim("h2", "coder", "write_file", write("b.py"), "/p")).toBe(
      null
    );
    expect(
      claims.claim("h2", "tester", "edit_file", write("a.py"), "/p")
    ).toMatch(/^Not run: a\.py is being changed by the coder/);
    // Reading is never held
    expect(
      claims.claim("h2", "tester", "read_text_file", write("a.py"), "/p")
    ).toBe(null);
    claims.release("h1");
    expect(claims.claim("h2", "tester", "edit_file", write("a.py"), "/p")).toBe(
      null
    );
  });
});

describe("agents talking to each other", () => {
  it("delivers a note to the teammate it names, with its next result", () => {
    const team = new TeamRun();
    team.join("h1", "coder", "change api.py");
    team.join("h2", "tester", "write tests for cli.py");
    team.addNote(
      "api.py now returns a dict",
      { runId: "h1", role: "coder" },
      "tester"
    );
    expect(team.takeInbox("h2")).toEqual([
      "coder (h1): api.py now returns a dict",
    ]);
    expect(team.takeInbox("h2")).toEqual([]);
    // Not back to the sender
    expect(team.takeInbox("h1")).toEqual([]);
    // Agents that start later see it among the notes
    expect(team.notesBlock()).toContain(
      "coder to tester: api.py now returns a dict"
    );
  });

  it("sends a note without a name to every running teammate", () => {
    const team = new TeamRun();
    team.join("h1", "coder", "a");
    team.join("h2", "coder", "b");
    team.join("h3", "reviewer", "c");
    team.addNote("tests run with pytest -q", { runId: "h3", role: "reviewer" });
    expect(team.takeInbox("h1")).toHaveLength(1);
    expect(team.takeInbox("h2")).toHaveLength(1);
    expect(team.takeInbox("h3")).toEqual([]);
  });

  it("tells an agent who works beside it, and forgets one that left", () => {
    const team = new TeamRun();
    team.join("h1", "coder", "change api.py");
    team.join("h2", "tester", "tests");
    expect(team.teammatesBlock("h2")).toContain("- coder (h1): change api.py");
    team.leave("h1");
    expect(team.teammatesBlock("h2")).toBe("");
    team.addNote("late", { runId: "h2", role: "tester" }, "coder");
    expect(team.takeInbox("h1")).toEqual([]);
  });
});
