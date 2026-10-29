import { describe, expect, it, vi } from "vitest";
import {
  keepCharsFor,
  addToCapsule,
  capsuleCut,
  cleanNote,
  fitKept,
  latestExchange,
  needsNote,
  noteRequest,
  renderCapsule,
  requestText,
  restoreHistory,
  stepsFrom,
  summariseOldest,
  type Capsule,
  type SavedMessage,
} from "./taskCapsule";
import { compactHistory, type HistoryEntry } from "./historyCompaction";

const call = (tool: string, args: Record<string, unknown>) =>
  `<tool_call>\n<server>filesystem</server>\n<tool>${tool}</tool>\n<arguments>${JSON.stringify(args)}</arguments>\n</tool_call>`;

const result = (tool: string, body: string) =>
  `<tool_result trusted="false">\n<tool>${tool}</tool>\n<result>\n${body}\n</result>\n</tool_result>`;

const failure = (tool: string, error: string) =>
  `<tool_result trusted="false">\n<tool>${tool}</tool>\n<error>${error}</error>\n</tool_result>`;

const results = (...blocks: string[]) =>
  `You executed ${blocks.length} tool call(s). Here are the results:\n\n${blocks.join("\n\n")}\n\nIf you need another tool, call it now.`;

const user = (content: string): HistoryEntry => ({ role: "user", content });
const assistant = (content: string): HistoryEntry => ({
  role: "assistant",
  content,
});

const bigFile = "const x = 1;\n".repeat(400); // ~5k characters

describe("requestText", () => {
  it("drops the notes SHIELD appends for the model", () => {
    expect(
      requestText(
        "add dark mode\n\n[Current folder: C:/p]\n\n[Not run: your last tool call(s) were stopped: write_file C:/p/a.js. Make them again.]"
      )
    ).toBe("add dark mode");
  });

  it("drops the work record too, brackets in commands and all", () => {
    expect(
      requestText(
        "run the tests\n\n[Current folder: C:/p]\n\n[SHIELD's record of the changes and commands in this conversation, from the tools' actual results:\n- ran `[Console]::Write(1)` - exit 0\n- edited a.ps1]"
      )
    ).toBe("run the tests");
  });

  it("unwraps the tool retry prompt", () => {
    expect(
      requestText(
        "You have MCP filesystem tools available in this environment.\nAllowed tools: write_file.\nNo prose before or after the tool call.\n\nUser request: make a notes.txt"
      )
    ).toBe("make a notes.txt");
  });

  it("keeps a long request to one short line", () => {
    const text = requestText(`build ${"a very long request ".repeat(40)}`);
    expect(text.length).toBe(300);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("\n");
  });
});

describe("stepsFrom", () => {
  it("lists what each call did, counting repeats", () => {
    const steps = stepsFrom([
      user("build it"),
      assistant(call("write_file", { path: "C:/p/index.html", content: "x" })),
      user(results(result("write_file", "Successfully wrote"))),
      assistant(call("edit_file", { path: "C:/p/app.js", edits: [] })),
      user(results(result("edit_file", "@@ -1 +1 @@"))),
      assistant(call("edit_file", { path: "C:/p/app.js", edits: [] })),
      user(results(result("edit_file", "@@ -2 +2 @@"))),
      assistant("Done."),
    ]);
    expect(steps).toEqual([
      { verb: "wrote", target: "C:/p/index.html", count: 1 },
      { verb: "edited", target: "C:/p/app.js", count: 2 },
    ]);
  });

  it("marks failed calls and calls a mode refused", () => {
    const steps = stepsFrom([
      assistant(
        call("edit_file", { path: "C:/p/a.js", edits: [] }) +
          call("write_file", { path: "C:/p/b.js", content: "x" })
      ),
      user(
        results(
          failure("edit_file", "Could not find exact match for edit"),
          failure(
            "write_file",
            "Plan mode: 'write_file' was NOT executed and has been recorded"
          )
        )
      ),
    ]);
    expect(steps.map((s) => s.outcome)).toEqual(["failed", "not run"]);
  });

  it("names web searches, pages, moves and multi-file reads", () => {
    const steps = stepsFrom([
      assistant(
        call("web_search", { query: "node lts" }) +
          call("fetch_page", { url: "https://nodejs.org/en" }) +
          call("move_file", { source: "C:/p/a", destination: "C:/p/b" }) +
          call("read_multiple_files", { paths: ["C:/p/x", "C:/p/y"] })
      ),
    ]);
    expect(steps.map((s) => `${s.verb} ${s.target}`)).toEqual([
      'searched the web for "node lts"',
      "read the page https://nodejs.org/en",
      "moved C:/p/a → C:/p/b",
      "read C:/p/x, C:/p/y",
    ]);
  });

  it("still finds the paths after old payloads were cleared", () => {
    const history = [
      assistant(call("write_file", { path: "C:/p/big.js", content: bigFile })),
      user(results(result("write_file", "Successfully wrote"))),
      assistant("ok"),
    ];
    const cleared = compactHistory(history, 1).history;
    expect(cleared[0]!.content).not.toContain("const x");
    expect(stepsFrom(cleared)).toEqual([
      { verb: "wrote", target: "C:/p/big.js", count: 1 },
    ]);
  });

  it("does not guess outcomes when results and calls do not line up", () => {
    const steps = stepsFrom([
      assistant(
        call("read_text_file", { path: "C:/p/a" }) +
          call("read_text_file", { path: "C:/p/b" })
      ),
      user(results(failure("read_text_file", "ENOENT"))),
    ]);
    expect(steps.every((s) => s.outcome === undefined)).toBe(true);
  });
});

describe("addToCapsule", () => {
  const older = [
    user("build a search page\n\n[Current folder: C:/p]"),
    assistant(call("write_file", { path: "C:/p/index.html", content: "x" })),
    user(results(result("write_file", "Successfully wrote"))),
    assistant("Built it."),
  ];

  it("keeps what the user typed, not the tool results", () => {
    const capsule = addToCapsule(null, older, "Page done; styling left.");
    expect(capsule.requests).toEqual(["build a search page"]);
    expect(capsule.steps).toHaveLength(1);
    expect(capsule.note).toBe("Page done; styling left.");
  });

  it("adds to an earlier capsule and replaces its note", () => {
    const first = addToCapsule(null, older, "first note");
    const second = addToCapsule(
      first,
      [
        user("now style it"),
        assistant(
          call("write_file", { path: "C:/p/index.html", content: "y" })
        ),
        user(results(result("write_file", "Successfully wrote"))),
        assistant("Styled."),
      ],
      "second note"
    );
    expect(second.requests).toEqual(["build a search page", "now style it"]);
    expect(second.steps).toEqual([
      { verb: "wrote", target: "C:/p/index.html", count: 2 },
    ]);
    expect(second.note).toBe("second note");
    // The first capsule is not changed by the second
    expect(first.steps[0]!.count).toBe(1);
  });

  it("keeps the old note when the model wrote none", () => {
    const first = addToCapsule(null, older, "first note");
    expect(addToCapsule(first, [user("more")], "").note).toBe("first note");
  });

  it("drops tool calls from the note", () => {
    const capsule = addToCapsule(
      null,
      older,
      `Next: style it.\n${call("read_text_file", { path: "C:/p/a" })}`
    );
    expect(capsule.note).toBe("Next: style it.");
  });

  it("keeps the latest 12 requests and counts the rest", () => {
    const many = Array.from({ length: 15 }, (_, i) => [
      user(`request ${i}`),
      assistant(`answer ${i}`),
    ]).flat();
    const capsule = addToCapsule(null, many, "");
    expect(capsule.requests).toHaveLength(12);
    expect(capsule.requests[0]).toBe("request 3");
    expect(capsule.earlierRequests).toBe(3);
  });
});

describe("cleanNote", () => {
  it("keeps the three lines it asked for, and nothing after them", () => {
    const note = [
      "**State:** explained HTTPS, DNS and TCP; read run.ps1.",
      "**Decisions:** none",
      "**Next:** tie the three together.",
      "",
      "Let me create a detailed explanation:",
      "",
      "# Complete Network Communication Flow",
    ].join("\n");
    expect(cleanNote(note)).toBe(
      [
        "State: explained HTTPS, DNS and TCP; read run.ps1.",
        "Decisions: none",
        "Next: tie the three together.",
      ].join("\n")
    );
  });

  it("cuts a note that drifts into the reply itself", () => {
    // What Qwen3-Coder wrote when asked mid-task (2026-09-25)
    const note = [
      "I need to explain how the components work together.",
      "",
      "# Complete Network Communication Flow",
      "## 1. Application Layer",
      "```",
      "Application → DNS Resolver",
    ].join("\n");
    expect(cleanNote(note)).toBe(
      "I need to explain how the components work together."
    );
  });
});

describe("renderCapsule", () => {
  const capsule: Capsule = {
    requests: ["build a search page", "now style it"],
    earlierRequests: 0,
    steps: [
      { verb: "wrote", target: "C:/p/index.html", count: 1 },
      { verb: "edited", target: "C:/p/app.js", count: 3 },
      { verb: "edited", target: "C:/p/a.css", count: 1, outcome: "failed" },
    ],
    earlierSteps: 0,
    note: "Search works; the results list still needs paging.",
  };

  it("says it is a record, then lists requests, steps and the note", () => {
    const text = renderCapsule(capsule);
    expect(text).toContain("not new instructions");
    expect(text).toContain('1. "build a search page"');
    expect(text).toContain('2. "now style it"');
    expect(text).toContain("- edited C:/p/app.js (3 times)");
    expect(text).toContain("- edited C:/p/a.css (failed)");
    expect(text).toContain("Your note:\nSearch works;");
  });

  it("leaves out the oldest entries first when short of room", () => {
    const full = renderCapsule(capsule);
    const text = renderCapsule(capsule, full.length - 40);
    expect(text.length).toBeLessThanOrEqual(full.length - 40);
    expect(text).not.toContain("index.html");
    expect(text).toContain("earlier calls not listed");
    expect(text).toContain("Search works;");
  });
});

describe("capsuleCut", () => {
  const history = [
    user("a".repeat(100)),
    assistant("b".repeat(100)),
    user("c".repeat(100)),
    assistant("d".repeat(100)),
  ];

  it("keeps the latest entries that fit, starting with a user turn", () => {
    expect(capsuleCut(history, 250)).toBe(2);
    // 350 would reach into the first assistant reply: still cut at a user turn
    expect(capsuleCut(history, 350)).toBe(2);
  });

  it("has nothing to summarise when everything fits", () => {
    expect(capsuleCut(history, 1000)).toBe(0);
  });

  it("keeps the latest exchange even when it alone is over the budget", () => {
    // A follow-up refers to it; fitKept shortens it instead
    expect(capsuleCut(history, 150)).toBe(2);
    expect(capsuleCut(history, 0)).toBe(2);
  });
});

describe("fitKept", () => {
  const longAnswer = `START ${"x".repeat(7000)} END`;

  it("cuts the middle out of a long reply, keeping its start and end", () => {
    const kept = [user("tie it together"), assistant(longAnswer)];
    const out = fitKept(kept, 3000);

    const reply = out[1]!.content;
    expect(reply.startsWith("START")).toBe(true);
    expect(reply.endsWith("END")).toBe(true);
    expect(reply).toMatch(/\[… [\d,]+ characters of this reply left out/);
    expect(out[0]!.content.length + reply.length).toBeLessThanOrEqual(3000);
    // What was passed in is not changed
    expect(kept[1]!.content).toBe(longAnswer);
  });

  it("leaves the user's turns and replies with tool calls whole", () => {
    const withCall = `Reading it.\n${call("read_text_file", { path: "C:/p/a" })}${"y".repeat(5000)}`;
    const kept = [user("z".repeat(5000)), assistant(withCall)];
    expect(fitKept(kept, 1000)).toEqual(kept);
  });

  it("never shortens a reply below about 1,500 characters", () => {
    const out = fitKept([user("q"), assistant(longAnswer)], 10);
    expect(out[1]!.content.length).toBeLessThanOrEqual(1500);
    expect(out[1]!.content.length).toBeGreaterThan(1450);
  });
});

describe("noteRequest", () => {
  it("warns that tool results have not been seen yet", () => {
    const request = noteRequest(
      results(result("web_search", "1. modelcontextprotocol.io"))
    );
    expect(request).toContain("You have not seen them yet");
    expect(request).toContain("State:");
  });

  it("says the user speaks next otherwise", () => {
    expect(noteRequest("and what about MCP?")).toContain(
      "The user's next message comes right after this note."
    );
  });
});

describe("latestExchange", () => {
  it("starts at the last user-role entry, tool results included", () => {
    expect(
      latestExchange([
        user("fix it"),
        assistant(call("read_text_file", { path: "C:/p/a" })),
        user(results(result("read_text_file", "x"))),
        assistant(call("edit_file", { path: "C:/p/a", edits: [] })),
      ])
    ).toBe(2);
    expect(latestExchange([])).toBe(0);
  });
});

describe("needsNote", () => {
  const earlier = addToCapsule(null, [user("fix the wifi scripts")], "note");
  const toolRound = [
    assistant(call("read_text_file", { path: "C:/p/run.ps1" })),
    user(results(result("read_text_file", bigFile))),
  ];

  it("always writes a first note", () => {
    expect(needsNote(toolRound, null)).toBe(true);
  });

  it("skips a slice of plain tool rounds", () => {
    // What made every round at 8K pause 4-7 s for a note (2026-09-25)
    expect(needsNote(toolRound, earlier)).toBe(false);
  });

  it("writes one when the slice holds a request or real reasoning", () => {
    expect(needsNote([user("now fix it"), ...toolRound], earlier)).toBe(true);
    expect(
      needsNote(
        [assistant(`${"The signatures are wrong. ".repeat(50)}`), ...toolRound],
        earlier
      )
    ).toBe(true);
  });
});

describe("summariseOldest", () => {
  const history = [
    user("build a search page"),
    assistant("Built it."),
    user("now style it"),
    assistant("Styled."),
  ];

  it("asks for a note on the turns it removes and keeps the rest", async () => {
    const writeNote = vi.fn().mockResolvedValue("All done so far.");
    const out = await summariseOldest(history, null, 30, writeNote);

    expect(writeNote).toHaveBeenCalledWith(history.slice(0, 2));
    expect(out?.history).toEqual(history.slice(2));
    expect(out?.capsule.requests).toEqual(["build a search page"]);
    expect(out?.capsule.note).toBe("All done so far.");
  });

  it("keeps a long latest answer, shortened, instead of dropping it", async () => {
    // 8K window: a quarter is ~6,000 characters, the last answer was 7,937
    const answer = `## How it all comes together ${"z".repeat(7900)} In short: DNS, then TCP, then HTTP.`;
    const long = [...history, user("now tie them together"), assistant(answer)];
    const out = await summariseOldest(long, null, 6000, async () => "note");

    expect(out?.history).toHaveLength(2);
    expect(out?.history[0]!.content).toBe("now tie them together");
    const kept = out!.history[1]!.content;
    expect(kept.startsWith("## How it all comes together")).toBe(true);
    expect(kept.endsWith("then TCP, then HTTP.")).toBe(true);
    expect(kept.length).toBeLessThan(6000);
  });

  it("still makes room when the model cannot write a note", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await summariseOldest(history, null, 30, () =>
      Promise.reject(new Error("HTTP 500"))
    );
    warn.mockRestore();

    expect(out?.history).toEqual(history.slice(2));
    expect(out?.capsule.note).toBe("");
  });

  it("passes Stop on", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    await expect(
      summariseOldest(history, null, 30, () => Promise.reject(abort))
    ).rejects.toBe(abort);
  });

  it("does nothing when there is nothing older to summarise", async () => {
    const writeNote = vi.fn();
    expect(await summariseOldest(history, null, 10_000, writeNote)).toBeNull();
    expect(writeNote).not.toHaveBeenCalled();
  });

  it("folds a slice of tool rounds into the lists without asking", async () => {
    const earlier = addToCapsule(null, [user("fix the wifi scripts")], "old");
    const writeNote = vi.fn();
    const rounds = [
      assistant(call("read_text_file", { path: "C:/p/run.ps1" })),
      user(results(result("read_text_file", "x"))),
      assistant(call("read_text_file", { path: "C:/p/set-radio.ps1" })),
      user(results(result("read_text_file", "y"))),
      assistant("Found it."),
    ];
    const out = await summariseOldest(rounds, earlier, 50, writeNote);

    expect(writeNote).not.toHaveBeenCalled();
    expect(out?.capsule.note).toBe("old");
    expect(out?.capsule.steps.map((s) => s.target)).toEqual([
      "C:/p/run.ps1",
      "C:/p/set-radio.ps1",
    ]);
  });
});

describe("restoreHistory", () => {
  const capsule: Capsule = {
    requests: ["build a search page"],
    earlierRequests: 0,
    steps: [],
    earlierSteps: 0,
    note: "State: page built.",
  };
  const savedOn = (
    reply: string,
    modelHistory: HistoryEntry[],
    replacedEntries = 2
  ): SavedMessage => ({
    ...assistant(reply),
    capsule: { ...capsule, modelHistory, replacedEntries },
  });

  it("joins back-to-back messages of one role into one turn", () => {
    // One saved message per tool result, and the round-limit notice after
    // the model's last reply: the server refuses two assistant messages at
    // the end (2026-09-25)
    const { history, saved } = restoreHistory([
      user("read a and b"),
      assistant("calls"),
      user(result("read_text_file", "A")),
      user(result("read_text_file", "B")),
      assistant("Both are short."),
      assistant("Stopped after 20 rounds of tool calls."),
    ]);
    expect(history).toEqual([
      user("read a and b"),
      assistant("calls"),
      user(
        `${result("read_text_file", "A")}\n\n${result("read_text_file", "B")}`
      ),
      assistant("Both are short.\n\nStopped after 20 rounds of tool calls."),
    ]);
    expect(saved).toBeNull();
  });

  it("resumes from the exact kept model history, then the visible request and reply", () => {
    const modelHistory = [
      user("now style it"),
      assistant("Styled, shortened."),
    ];
    const { history, saved } = restoreHistory([
      user("build a search page"),
      assistant("Built it."),
      user("now style it"),
      assistant("Styled, with a long explanation."),
      user("add paging"),
      savedOn("Paging added.", modelHistory),
      user("thanks"),
      assistant("You're welcome."),
    ]);
    expect(history).toHaveLength(8);
    expect(history[3]?.content).toBe("Styled, with a long explanation.");
    expect(saved).toEqual({
      capsule,
      modelHistory,
      start: 4,
      replacedEntries: 2,
    });
    expect([...saved!.modelHistory, ...history.slice(saved!.start)]).toEqual([
      ...modelHistory,
      user("add paging"),
      assistant("Paging added."),
      user("thanks"),
      assistant("You're welcome."),
    ]);
  });

  it("uses the latest capsule, which holds the earlier ones", () => {
    const later = {
      ...capsule,
      note: "State: styled too.",
      modelHistory: [user("e"), assistant("f")],
      replacedEntries: 4,
    };
    const { saved } = restoreHistory([
      user("a"),
      assistant("b"),
      user("c"),
      savedOn("d", [], 2),
      user("e"),
      assistant("f"),
      user("g"),
      { ...assistant("h"), capsule: later },
    ]);
    expect(saved?.capsule.note).toBe("State: styled too.");
    expect(saved?.modelHistory).toEqual([user("e"), assistant("f")]);
    expect(saved?.start).toBe(6);
    expect(saved?.replacedEntries).toBe(4);
  });

  it("restores the chat whole when the saved snapshot is invalid", () => {
    expect(
      restoreHistory([
        user("a"),
        assistant("b"),
        user("c"),
        savedOn("d", [], 0),
      ]).saved
    ).toBeNull();
    expect(
      restoreHistory([
        user("a"),
        assistant("b"),
        {
          ...savedOn("d", []),
          capsule: {
            ...capsule,
            keptTurns: 1,
          } as unknown as SavedMessage["capsule"],
        },
      ]).saved
    ).toBeNull();
  });

  it("keeps model-only retry turns that the visible chat never saved", () => {
    const modelHistory = [
      user("read file"),
      assistant("I cannot."),
      user("retry with the filesystem tool"),
      assistant("The file says hello."),
    ];
    const { history, saved } = restoreHistory([
      user("older"),
      assistant("Done."),
      user("read file"),
      assistant("The file says hello."),
      user("what next?"),
      savedOn("Continue.", modelHistory),
    ]);
    expect([...saved!.modelHistory, ...history.slice(saved!.start)]).toEqual([
      ...modelHistory,
      user("what next?"),
      assistant("Continue."),
    ]);
  });

  it("finds the cut summariseOldest made in the chat as it was saved", async () => {
    const readBoth =
      call("read_text_file", { path: "C:/p/a" }) +
      call("read_text_file", { path: "C:/p/b" });
    // The model's history: one turn for the results of one reply's calls
    const live = [
      user("read a and b"),
      assistant(readBoth),
      user(
        results(result("read_text_file", "A"), result("read_text_file", "B"))
      ),
      assistant("Both are short."),
      user("compare them"),
      assistant("A is older than B."),
    ];
    const out = await summariseOldest(live, null, 60, async () => "note");
    expect(out?.history).toEqual(live.slice(4));

    // The chat: one message per result, the round-limit notice, and the
    // capsule saved on the reply to the request that needed it
    const { history, saved } = restoreHistory([
      user("read a and b"),
      assistant(readBoth),
      user(result("read_text_file", "A")),
      user(result("read_text_file", "B")),
      assistant("Both are short."),
      assistant("Stopped after 20 rounds of tool calls."),
      user("compare them"),
      assistant("A is older than B."),
      user("which is longer?"),
      {
        ...assistant("B."),
        capsule: {
          ...out!.capsule,
          modelHistory: out!.history,
          replacedEntries: live.length - out!.history.length,
        },
      },
    ]);
    expect(saved?.capsule).toEqual(out!.capsule);
    expect(history).toHaveLength(8);
    expect([...saved!.modelHistory, ...history.slice(saved!.start)]).toEqual([
      ...live.slice(4),
      user("which is longer?"),
      assistant("B."),
    ]);
  });
});

describe("keepCharsFor", () => {
  it("keeps what fits under CLEAR_TO beside the system prompt and capsule", () => {
    // Bonsai 2 27B: 24k window, a 10k-character system prompt
    const keep = keepCharsFor(24576, 10_000, 0.4);
    expect(keep).toBeCloseTo(24576 * 3 * 0.3 - 10_000);
    // Prompt, the largest capsule and the kept turns: 40% of the window
    expect((10_000 + 24576 * 3 * 0.1 + keep) / (24576 * 3)).toBeCloseTo(0.4);
  });

  it("keeps at most a quarter of a large window", () => {
    expect(keepCharsFor(131072, 10_000, 0.4)).toBe(131072 * 3 * 0.25);
  });

  it("always keeps a little, however small the window", () => {
    expect(keepCharsFor(8192, 20_000, 0.4)).toBeCloseTo(8192 * 3 * 0.1);
  });
});
