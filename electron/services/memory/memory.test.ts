// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import {
  entriesOf,
  formatSearchResults,
  ftsQuery,
  notDoneLines,
  queryTerms,
  recordLinesFor,
  type MemoryConversation,
} from "./memoryEntries";
import { MemoryIndex } from "./memoryIndex";
import { runMemoryTool } from "./memoryTools";

const envelope = (tool: string, body: string, error = false) =>
  `<tool_result trusted="false">\n<tool>${tool}</tool>\n${error ? `<error>${body}</error>` : `<result>\n${body}\n</result>`}\n</tool_result>`;

const wifi: MemoryConversation = {
  id: "conv-wifi",
  title: "Folder Contents Inquiry",
  kind: "code",
  folder: String.raw`C:\Users\me\Continue\wifi`,
  createdAt: "2026-09-27T10:00:00Z",
  updatedAt: "2026-09-27T12:00:00Z",
  messages: [
    { role: "user", content: "look for bugs in the wifi radio scripts" },
    {
      role: "assistant",
      content:
        'Let me check.\n<tool_call>\n<server>filesystem</server>\n<tool>edit_file</tool>\n<arguments>{"path":"set-radio.ps1","edits":[]}</arguments>\n</tool_call>',
    },
    {
      role: "user",
      content: envelope(
        "edit_file",
        "Could not find exact match for edit: GUID section",
        true
      ),
      toolResult: {
        tool: "edit_file",
        target: "set-radio.ps1",
        success: false,
      },
    },
    {
      role: "assistant",
      content:
        "The GUID handling in set-radio.ps1 still uses the hardcoded netsh GUID.",
    },
  ],
};

const recipes: MemoryConversation = {
  id: "conv-food",
  title: "Dinner ideas",
  createdAt: "2026-09-20T18:00:00Z",
  updatedAt: "2026-09-20T18:05:00Z",
  messages: [
    { role: "user", content: "what can I cook with rice and beans" },
    { role: "assistant", content: "Rice and beans make a good burrito bowl." },
  ],
};

describe("entriesOf", () => {
  it("indexes requests, replies with the calls they made, and tool results", () => {
    const entries = entriesOf(wifi);
    expect(entries.map((e) => [e.id, e.role])).toEqual([
      ["conv-wifi#0", "user"],
      ["conv-wifi#1", "assistant"],
      ["conv-wifi#2", "tool"],
      ["conv-wifi#3", "assistant"],
      ["conv-wifi#record", "record"],
    ]);
    // What the session actually did, from the tools' results
    expect(entries[4]!.text).toBe(
      "SHIELD's record of what this session actually changed and ran, from the tools' results:\n- edit of set-radio.ps1 FAILED - nothing changed (Could not find exact match for edit: GUID section)"
    );
    expect(entries[1]!.text).toBe(
      "Let me check.\ncalled edit_file set-radio.ps1"
    );
    expect(entries[2]!.text).toBe(
      "edit_file set-radio.ps1 (failed)\nCould not find exact match for edit: GUID section"
    );
    expect(entries[0]!.kind).toBe("code");
    expect(entriesOf(recipes)[0]!.kind).toBe("chat");
  });
});

describe("the session's plan", () => {
  it("is indexed as it was left, open steps and all", () => {
    const entries = entriesOf({
      ...wifi,
      plan: {
        steps: [
          { step: "Fix the GUID section", status: "completed" },
          { step: "Test on the laptop", status: "pending" },
        ],
        note: "Waiting on the laptop",
        updatedAt: "2026-09-28T10:00:00Z",
        by: "model",
      },
    });
    const plan = entries.at(-1)!;
    expect([plan.id, plan.role]).toEqual(["conv-wifi#plan", "plan"]);
    expect(plan.text).toBe(
      "The session's plan, as it was left (1 of 2 steps still open):\n[x] Fix the GUID section\n[ ] Test on the laptop\nNote: Waiting on the laptop"
    );
    expect(plan.createdAt).toBe(Date.parse("2026-09-28T10:00:00Z"));
  });
});

describe("what is not indexed", () => {
  it("leaves out memory's own results, which only copy other entries", () => {
    const entries = entriesOf({
      ...recipes,
      id: "conv-recall",
      messages: [
        { role: "user", content: "what did we cook" },
        {
          role: "user",
          content: envelope("search_memory", "Memory matches for rice ..."),
          toolResult: { tool: "search_memory", success: true },
        },
      ],
    });
    expect(entries.map((e) => e.role)).toEqual(["user"]);
  });
});

describe("queryTerms", () => {
  it("keeps the words that say what to find, split like the index", () => {
    expect(queryTerms("Is the GUID fix in set-radio.ps1 applied?")).toEqual([
      "guid",
      "fix",
      "set",
      "radio",
      "ps1",
      "applied",
    ]);
    expect(queryTerms("is it ok?")).toEqual([]);
    expect(ftsQuery(['say "hi"'])).toBe('"say ""hi"""');
  });
});

describe("MemoryIndex", () => {
  let index: MemoryIndex;
  beforeEach(async () => {
    index = new MemoryIndex(":memory:");
    await index.indexConversation(wifi);
    await index.indexConversation(recipes);
  });
  afterEach(() => index.close());

  it("finds the conversation a question is about, and not the others", async () => {
    const hits = await index.search(
      "what happened with the GUID fix in set-radio"
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.conversationId === "conv-wifi")).toBe(true);
    expect(hits[0]!.snippet.toLowerCase()).toContain("guid");
    expect(await index.search("burrito")).toMatchObject([
      { conversationId: "conv-food", role: "assistant" },
    ]);
  });

  it("finds a word in another form (stemming)", async () => {
    const hits = await index.search("cooking");
    expect(hits[0]?.conversationId).toBe("conv-food");
  });

  it("leaves out the conversation being answered, and weak matches", async () => {
    expect(
      await index.search("guid radio", { excludeConversation: "conv-wifi" })
    ).toEqual([]);
    // One shared word of four is not enough when two are asked for
    expect(
      await index.search("rice radio lamp chair", { minMatched: 2 })
    ).toEqual([]);
    expect(
      await index.search("guid netsh hardcoded chair lamp table sofa", {
        minMatched: 2,
        minShare: 0.5,
      })
    ).toEqual([]);
  });

  it("takes at most a couple of matches from one conversation", async () => {
    const hits = await index.search("set radio guid edit", { limit: 5 });
    expect(hits.filter((h) => h.conversationId === "conv-wifi").length).toBe(2);
  });

  it("reads one entry back with the request it followed", async () => {
    const record = await index.read("conv-wifi#3");
    expect(record).toMatchObject({
      role: "assistant",
      request: "look for bugs in the wifi radio scripts",
    });
    expect(record?.text).toContain("hardcoded netsh GUID");
    expect(await index.read("conv-wifi#99")).toBeNull();
  });

  it("finds a session's plan and reads it back whole", async () => {
    await index.indexConversation({
      ...wifi,
      plan: {
        steps: [
          { step: "Test the radio switch on the laptop", status: "pending" },
        ],
        updatedAt: "2026-09-28T10:00:00Z",
        by: "model",
      },
    });
    const hits = await index.search("laptop radio switch");
    expect(hits[0]).toMatchObject({ id: "conv-wifi#plan", role: "plan" });
    const plan = await index.read("conv-wifi#plan");
    expect(plan?.text).toContain("[ ] Test the radio switch on the laptop");
    expect(plan).not.toHaveProperty("request");
  });

  it("starts over when the index was made by an older version", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shield-memory-"));
    const file = path.join(dir, "memory.db");
    try {
      const first = new MemoryIndex(file);
      await first.indexConversation(wifi);
      await first.close();
      // Same version: kept
      const again = new MemoryIndex(file);
      expect((await again.indexedVersions()).has("conv-wifi")).toBe(true);
      await again.close();
      // Pretend it was made before records existed
      const db = new (createRequire(import.meta.url)("sqlite3").Database)(file);
      await new Promise((resolve) =>
        db.run("UPDATE meta SET value = '1' WHERE key = 'version'", resolve)
      );
      await new Promise((resolve) => db.close(resolve));
      const newer = new MemoryIndex(file);
      expect((await newer.indexedVersions()).size).toBe(0);
      expect(await newer.search("guid")).toEqual([]);
      await newer.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("replaces a conversation when it is indexed again, and removes it", async () => {
    await index.indexConversation({
      ...wifi,
      updatedAt: "2026-09-28T09:00:00Z",
      messages: [{ role: "user", content: "rename the project" }],
    });
    expect(await index.search("guid")).toEqual([]);
    expect((await index.indexedVersions()).get("conv-wifi")).toBe(
      Date.parse("2026-09-28T09:00:00Z")
    );
    await index.removeConversation("conv-wifi");
    expect(await index.search("rename project")).toEqual([]);
  });
});

describe("memory tools", () => {
  let index: MemoryIndex;
  beforeEach(async () => {
    index = new MemoryIndex(":memory:");
    await index.indexConversation(wifi);
  });
  afterEach(() => index.close());

  const text = (result: Awaited<ReturnType<typeof runMemoryTool>>) =>
    result.success
      ? (result.data as { content: { text: string }[] }).content[0]!.text
      : (result.error ?? "");

  it("search_memory lists matches with ids to open", async () => {
    const out = text(
      await runMemoryTool("search_memory", { query: "GUID" }, index)
    );
    expect(out).toMatch(
      /^Memory matches for "GUID", best first:\n1\. \[conv-wifi#\d\] 2026-09-27 · code session "Folder Contents Inquiry" \(wifi\)/
    );
    expect(out).toContain("To read one in full, call open_memory with its id.");
  });

  it("open_memory reads one, with or without the brackets", async () => {
    const out = text(
      await runMemoryTool("open_memory", { id: "[conv-wifi#3]" }, index)
    );
    expect(out).toContain(
      "The user's request:\nlook for bugs in the wifi radio scripts"
    );
    expect(out).toContain(
      "The message (what was said at the time):\nThe GUID handling"
    );
  });

  it("says what to do when nothing matches or the id is wrong", async () => {
    expect(
      text(await runMemoryTool("search_memory", { query: "kubernetes" }, index))
    ).toContain('Nothing in memory matches "kubernetes"');
    const missing = await runMemoryTool("open_memory", { id: "nope#1" }, index);
    expect(missing.success).toBe(false);
    expect(text(missing)).toContain("exactly as search_memory gave it");
  });

  it("formats no results plainly", () => {
    expect(formatSearchResults("x", [])).toContain("Try other words");
  });

  // 2026-09-28: asked in a new chat what became of the GUID fix, Qwen3-Coder
  // opened the reply that had proposed it and said it was done
  it("warns under matches from a session whose record shows a change not made", async () => {
    const out = text(
      await runMemoryTool("search_memory", { query: "GUID set-radio" }, index)
    );
    expect(out).toContain(
      "Careful - a reply above may describe a change that never happened:"
    );
    expect(out).toContain(
      '- In "Folder Contents Inquiry", SHIELD\'s record shows these were NOT done: edit of set-radio.ps1 FAILED - nothing changed'
    );
  });

  it("opens a reply with what the record says became of its files", async () => {
    const out = text(
      await runMemoryTool("open_memory", { id: "conv-wifi#3" }, index)
    );
    expect(out).toContain("The message (what was said at the time):");
    expect(out).toContain(
      "What SHIELD's record shows actually happened to the files above, from the tools' results - where this and the message differ, the record is right:\n- edit of set-radio.ps1 FAILED - nothing changed"
    );
  });

  it("adds no record to a message about other files", async () => {
    const out = text(
      await runMemoryTool("open_memory", { id: "conv-wifi#0" }, index)
    );
    expect(out).not.toContain("What SHIELD's record shows");
  });
});

describe("record lines", () => {
  const lines = [
    "edited set-radio.ps1",
    "edit of set-radio.ps1 FAILED - nothing changed (no match)",
    "ran `pwsh -File diag.ps1` - exit 0",
    "wrote FIXES.md",
    "delete of old.ps1 - declined by the user, not done",
  ];

  it("picks the lines about the files a message names", () => {
    expect(recordLinesFor(lines, "In set-radio.ps1, replace the GUID")).toEqual(
      [lines[0], lines[1]]
    );
    // A file named only inside a command is not a change to it
    expect(recordLinesFor(lines, "diag.ps1 has error handling")).toEqual([]);
    expect(recordLinesFor(lines, "no files here")).toEqual([]);
  });

  it("finds what was not done", () => {
    expect(notDoneLines(lines)).toEqual([lines[1], lines[4]]);
  });
});
