import { describe, expect, it } from "vitest";
import {
  baseName,
  diffStat,
  groupIntoTurns,
  groupLabel,
  stepDetail,
  stepLabel,
  turnStats,
  workLabel,
  type WorkItem,
} from "./turns";
import type { Message } from "@/types/conversation";

let n = 0;
const msg = (
  role: "user" | "assistant",
  content: string,
  extra: Partial<Message> = {}
): Message => ({
  id: `m${n++}`,
  role,
  content,
  timestamp: new Date(),
  ...extra,
});

const tool = (name: string, target?: string, success = true): Message =>
  msg("user", "<tool_result><result>ok</result></tool_result>", {
    toolResult: { tool: name, serverName: "filesystem", success, target },
  });

describe("groupIntoTurns", () => {
  it("keeps a message sent while the reply ran inside that reply", () => {
    const turns = groupIntoTurns([
      msg("user", "fix calc.py"),
      msg("assistant", "Reading it"),
      tool("read_text_file", "calc.py"),
      msg("user", "use pytest", { steer: true }),
      tool("edit_file", "calc.py"),
      msg("assistant", "Done"),
    ]);
    expect(turns.map((t) => t.kind)).toEqual(["user", "assistant"]);
    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    expect(reply.parts.map((p) => p.kind)).toEqual([
      "text",
      "work",
      "steer",
      "work",
      "text",
    ]);
  });

  it("puts a reply's text and tool calls under one turn", () => {
    const messages = [
      msg("user", "build it"),
      msg("assistant", "Listing first"),
      tool("list_directory", "C:/p"),
      msg("assistant", "Creating folders"),
      tool("create_directory", "C:/p/src"),
      tool("create_directory", "C:/p/src/components"),
      msg("assistant", "Done"),
      msg("user", "thanks"),
    ];

    const turns = groupIntoTurns(messages);
    expect(turns.map((t) => t.kind)).toEqual(["user", "assistant", "user"]);

    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    // Text that calls no tool is a real reply and stays in view
    expect(reply.parts.map((p) => p.kind)).toEqual([
      "text",
      "work",
      "text",
      "work",
      "text",
    ]);
    // The two folder creations with no text between them form one group
    const group = reply.parts[3]!;
    expect(group.kind === "work" && group.items.length).toBe(2);
  });

  it("keeps a run of steps together across replies that were only a call", () => {
    const bareCall = `<tool_call>
<server>filesystem</server>
<tool>create_directory</tool>
<arguments>{"path":"b"}</arguments>
</tool_call>`;
    const turns = groupIntoTurns([
      msg("user", "go"),
      msg("assistant", "Making folders"),
      tool("create_directory", "a"),
      msg("assistant", bareCall),
      tool("create_directory", "b"),
    ]);
    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    expect(reply.parts.map((p) => p.kind)).toEqual(["text", "work"]);
    const group = reply.parts[1]!;
    expect(group.kind === "work" && group.items.length).toBe(2);
  });

  it("folds the lines between tool calls into one stretch of work", () => {
    const call = (path: string) =>
      `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"${path}"}</arguments>\n</tool_call>`;
    const turns = groupIntoTurns([
      msg("user", "review the repo"),
      msg("assistant", `I'll read the files one by one.\n${call("a.ps1")}`),
      tool("read_text_file", "a.ps1"),
      msg("assistant", `I'll continue examining the files.\n${call("b.ps1")}`),
      tool("read_text_file", "b.ps1"),
      msg(
        "assistant",
        "Both scripts call WlanOpenHandle; b.ps1 never frees it."
      ),
    ]);
    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    expect(reply.parts.map((p) => p.kind)).toEqual(["work", "text"]);
    const work = reply.parts[0]!;
    expect(work.kind === "work" && work.items.map((i) => i.kind)).toEqual([
      "narration",
      "tool",
      "narration",
      "tool",
    ]);
  });

  it("keeps a long explanation in view even when it ends in a call", () => {
    const explanation = `${"The radio handle is opened twice. ".repeat(20)}\n<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"a"}</arguments>\n</tool_call>`;
    const turns = groupIntoTurns([
      msg("user", "why?"),
      msg("assistant", explanation),
      tool("read_text_file", "a"),
    ]);
    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    expect(reply.parts.map((p) => p.kind)).toEqual(["text", "work"]);
  });

  it("shows a summary before the reply it was written for", () => {
    const bareCall = `<tool_call>
<server>filesystem</server>
<tool>read_text_file</tool>
<arguments>{"path":"a"}</arguments>
</tool_call>`;
    const turns = groupIntoTurns([
      msg("user", "go on"),
      msg("assistant", "Reading it again", { summary: "first capsule" }),
      tool("read_text_file", "a"),
      // A reply that is only a call shows nothing, but its summary shows
      msg("assistant", bareCall, { summary: "second capsule" }),
      tool("read_text_file", "a"),
      msg("assistant", "Done"),
    ]);
    const reply = turns[1]!;
    if (reply.kind !== "assistant") throw new Error("expected a reply");
    expect(reply.parts.map((p) => p.kind)).toEqual([
      "work",
      "text",
      "work",
      "text",
    ]);
    const summaries = reply.parts.flatMap((p) =>
      p.kind === "work"
        ? p.items.flatMap((i) =>
            i.kind === "summary" ? [i.message.summary] : []
          )
        : []
    );
    expect(summaries).toEqual(["first capsule", "second capsule"]);
    // The second summary sits between the two reads, where it happened
    const second = reply.parts[2]!;
    expect(second.kind === "work" && second.items.map((i) => i.kind)).toEqual([
      "tool",
      "summary",
      "tool",
    ]);
  });

  it("treats tool results as part of the reply, not user turns", () => {
    const turns = groupIntoTurns([msg("user", "hi"), tool("read_file")]);
    expect(turns.map((t) => t.kind)).toEqual(["user", "assistant"]);
  });
});

describe("workLabel", () => {
  const read = (target: string): WorkItem => ({
    kind: "tool",
    message: tool("read_text_file", target),
  });
  const summary: WorkItem = {
    kind: "summary",
    message: msg("assistant", "", { summary: "capsule" }),
  };

  it("says what a stretch of work did", () => {
    const items: WorkItem[] = [
      { kind: "tool", message: tool("list_directory", "C:/p/wifi") },
      ...["a", "b", "c"].map((f) => read(`C:/p/wifi/${f}.ps1`)),
      summary,
      read("C:/p/wifi/d.ps1"),
      summary,
      { kind: "narration", message: msg("assistant", "Next file.") },
    ];
    expect(workLabel(items)).toBe(
      "Listed wifi, read 4 files · summarised 2 times"
    );
  });

  it("names a single step, and counts the rest past two kinds", () => {
    expect(workLabel([read("C:/p/diag3.ps1")])).toBe("Read diag3.ps1");
    expect(
      workLabel([
        read("a"),
        { kind: "tool", message: tool("write_file", "b") },
        { kind: "tool", message: tool("edit_file", "c") },
        { kind: "tool", message: tool("edit_file", "d") },
      ])
    ).toBe("Read a, wrote b and 2 more steps");
  });

  it("falls back to the summaries alone", () => {
    expect(workLabel([summary])).toBe("Summarised earlier turns");
  });
});

describe("labels", () => {
  it("names the step by what it did", () => {
    expect(
      stepLabel("write_file", "filesystem", "C:\\p\\index.html", "done")
    ).toBe("Wrote index.html");
    expect(stepLabel("edit_file", "filesystem", "styles.css", "running")).toBe(
      "Editing styles.css"
    );
    expect(stepLabel("fetch", "web", undefined, "done")).toBe("web.fetch");
  });

  it("summarises a group", () => {
    expect(
      groupLabel([tool("create_directory"), tool("create_directory")])
    ).toBe("Created 2 folders");
    expect(groupLabel([tool("read_file"), tool("write_file")])).toBe(
      "Used 2 tools"
    );
  });

  it("names web steps by the query or the page", () => {
    expect(stepLabel("web_search", "web", "node 24 release", "done")).toBe(
      'Searched the web for "node 24 release"'
    );
    expect(
      stepLabel(
        "fetch_page",
        "web",
        "https://www.nodejs.org/en/blog/release/",
        "running"
      )
    ).toBe("Reading nodejs.org/en/blog/release");
    expect(groupLabel([tool("web_search"), tool("web_search")])).toBe(
      "Ran 2 searches"
    );
    expect(groupLabel([tool("delegate"), tool("delegate")])).toBe(
      "Made 2 delegations"
    );
  });

  it("takes the last path segment", () => {
    expect(baseName("C:\\Users\\me\\Searcher\\")).toBe("Searcher");
    expect(baseName("src/app.js")).toBe("app.js");
  });
});

describe("step details", () => {
  it("counts diff lines for an edit", () => {
    const diff =
      "--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-old line\n+new line\n+another\n same";
    expect(diffStat(diff)).toBe("+2 −1");
    expect(stepDetail("edit_file", diff, true)).toBe("+2 −1");
  });

  it("drops the redundant 'Successfully wrote' line", () => {
    expect(
      stepDetail("write_file", "Successfully wrote to C:\\a.txt", true)
    ).toBe("");
  });

  it("counts search results and shows which part of a page was read", () => {
    const results = [
      'Results for "x":',
      "",
      "1. A",
      "   https://a.example",
      "",
      "2. B",
      "   https://b.example",
    ].join("\n");
    expect(stepDetail("web_search", results, true)).toBe("2 results");
    const page = [
      "Title: T",
      "URL: u",
      "[Characters 1-8,000 of 16,100. To read on...]",
      "",
      "text",
    ].join("\n");
    expect(stepDetail("fetch_page", page, true)).toBe(
      "characters 1-8,000 of 16,100"
    );
  });

  it("shows the first line of a failure", () => {
    expect(
      stepDetail("edit_file", "Input validation error\nmore detail", false)
    ).toBe("Input validation error");
  });
});

describe("turnStats", () => {
  it("sums every generation in the reply", () => {
    const stats = turnStats([
      msg("assistant", "a", {
        stats: { outputTokens: 100, tokensPerSecond: 50, durationMs: 2000 },
      }),
      tool("read_file"),
      msg("assistant", "b", {
        stats: { outputTokens: 300, tokensPerSecond: 50, durationMs: 6000 },
      }),
    ]);
    expect(stats).toEqual({
      outputTokens: 400,
      durationMs: 8000,
      tokensPerSecond: 50,
    });
  });

  describe("for a hosted model", () => {
    const hosted = (
      servedBy: { provider?: string; zdr?: boolean } | undefined
    ) =>
      msg("assistant", "x", {
        stats: {
          outputTokens: 10,
          tokensPerSecond: 10,
          durationMs: 1000,
          servedBy,
        },
      });

    it("says zero retention only if every generation reported it", () => {
      expect(
        turnStats([
          hosted({ provider: "bedrock", zdr: true }),
          tool("web_search"),
          hosted({ provider: "bedrock", zdr: true }),
        ])?.servedBy
      ).toEqual({ provider: "bedrock", zdr: true });
    });

    it("turns to may-keep-data if one generation was served by a route that may", () => {
      expect(
        turnStats([
          hosted({ provider: "bedrock", zdr: true }),
          hosted({ provider: "bedrock", zdr: false }),
        ])?.servedBy?.zdr
      ).toBe(false);
    });

    it("names several providers when they differ, and claims nothing when one is silent", () => {
      expect(
        turnStats([
          hosted({ provider: "bedrock", zdr: true }),
          hosted({ provider: "fireworks", zdr: true }),
        ])?.servedBy
      ).toEqual({ provider: "several providers", zdr: true });
      expect(
        turnStats([
          hosted({ provider: "a", zdr: true }),
          hosted({ provider: "a" }),
        ])?.servedBy?.zdr
      ).toBeUndefined();
    });

    it("has none for a local model", () => {
      expect(turnStats([hosted(undefined)])).not.toHaveProperty("servedBy");
    });
  });
});

describe("update_plan steps", () => {
  it("says the plan was updated, and how far along it is", () => {
    expect(stepLabel("update_plan", "plan", undefined, "done")).toBe(
      "Updated the plan"
    );
    const saved =
      "Plan saved; the user sees it:\n[x] Read cart.js\n[>] Fix the total\n[ ] Run the tests";
    expect(stepDetail("update_plan", saved, true)).toBe("1 of 3 done");
    expect(stepDetail("update_plan", "Plan cleared.", true)).toBe("");
  });
});

describe("delegate steps", () => {
  it("names the role, and shows how the agent's run ended", () => {
    expect(stepLabel("delegate", "agents", "coder", "done")).toBe(
      "Delegated to coder"
    );
    expect(stepLabel("delegate", "agents", "tester", "running")).toBe(
      "Delegating to tester"
    );
    const report =
      "[coder · DONE · 3 steps · context 41%] handoff h2\nAGENT'S SUMMARY: fixed";
    expect(stepDetail("delegate", report, true)).toBe("done · 3 steps");
    expect(
      stepDetail(
        "delegate",
        "[tester · PARTIAL · 1 step · context 72%] handoff h3",
        true
      )
    ).toBe("partial · 1 step");
    expect(stepDetail("delegate", "something else", true)).toBe("");
  });
});

describe("run_command steps", () => {
  it("names the command, cut to fit", () => {
    expect(stepLabel("run_command", "terminal", "npm test", "done")).toBe(
      "Ran npm test"
    );
    expect(
      stepLabel("run_command", "terminal", "git log --oneline", "running")
    ).toBe("Running git log --oneline");
    const long = `Select-String -Path *.ps1 -Pattern "${"x".repeat(60)}"`;
    expect(stepLabel("run_command", "terminal", long, "done")).toBe(
      `Ran ${long.slice(0, 45)}...`
    );
    expect(stepLabel("run_command", "terminal", "a\nb", "done")).toBe(
      "Ran a ..."
    );
  });

  it("shows the exit code and time", () => {
    expect(
      stepDetail("run_command", "Exit code 1 · 2.4 s\nFAIL app.test.js", true)
    ).toBe("exit 1 · 2.4 s");
  });

  it("counts lines the terminal flagged as possible failures", () => {
    const body =
      "Exit code 0 · 2.2 s\n✗ Failed\n\n[Exit code 0, but 2 lines of the output look like failures. ...]";
    expect(stepDetail("run_command", body, true)).toBe(
      "exit 0 · 2.2 s · 2 possible failures"
    );
  });
});
