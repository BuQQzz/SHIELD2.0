// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlamaServerProvider } from "./LlamaServerProvider";
import type { SavedMessage } from "./taskCapsule";

interface SentRequest {
  stream?: boolean;
  messages: { role: string; content: string }[];
}

/**
 * A provider wired to a fake llama-server: streamed requests get `reply`,
 * others (the note before a summary) get `note`
 */
function connected(contextSize: number, note = "", reply = "ok") {
  const provider = new LlamaServerProvider();
  Object.assign(provider, {
    process: { exitCode: null },
    baseUrl: "http://server",
    contextSize,
  });
  const sent: SentRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as SentRequest;
      sent.push(body);
      if (!body.stream) {
        return Response.json({ choices: [{ message: { content: note } }] });
      }
      const events = [
        { choices: [{ delta: { content: reply } }] },
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 5 } },
      ];
      return new Response(
        [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]"]
          .map((line) => `${line}\n\n`)
          .join("")
      );
    })
  );
  return { provider, sent };
}

const user = (content: string): SavedMessage => ({ role: "user", content });
const assistant = (content: string): SavedMessage => ({
  role: "assistant",
  content,
});

// A 1,000-token window makes room above ~1,800 characters
const WINDOW = 1000;
const chat = [
  user("build a search page"),
  assistant(`Here is the page. ${"x".repeat(3000)}`),
  user("now style it"),
  assistant("Styled."),
];

describe("LlamaServerProvider restoring a summarised chat", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resumes from the saved summary instead of writing a new one", async () => {
    // Summarised live: the note is asked for once
    const live = connected(WINDOW, "State: page built.\nNext: styling.");
    live.provider.setChatHistory(chat);
    await live.provider.chat("add paging");
    expect(live.sent.map((r) => r.stream === true)).toEqual([false, true]);

    const capsule = live.provider.getLastCapsule();
    expect(capsule?.modelHistory).toEqual([
      user("now style it"),
      assistant("Styled."),
    ]);
    expect(capsule?.replacedEntries).toBe(2);
    expect(capsule?.note).toContain("State: page built.");
    expect(live.provider.getLastSummary()).toContain("State: page built.");

    // The saved conversation is plain JSON, with full visible content.
    const savedMessages: SavedMessage[] = [
      ...chat,
      user("add paging"),
      { ...assistant("ok"), capsule: capsule! },
    ];
    const roundTrip = JSON.parse(
      JSON.stringify(savedMessages)
    ) as SavedMessage[];
    expect(roundTrip[1]?.content).toBe(chat[1]?.content);
    expect(roundTrip[5]?.capsule).toEqual(capsule);

    // Reopened: the saved summary stands in for the oldest turns at once
    const reopened = connected(WINDOW, "a second note");
    reopened.provider.setChatHistory(roundTrip);
    await reopened.provider.chat("thanks");

    expect(reopened.sent).toHaveLength(1);
    const [system, ...turns] = reopened.sent[0]!.messages;
    expect(system!.content).toContain("Earlier in this conversation");
    expect(system!.content).toContain("State: page built.");
    expect(turns.map((m) => m.content)).toEqual([
      "now style it",
      "Styled.",
      "add paging",
      "ok",
      "thanks",
    ]);
    // No new summary, so none for the chat to save
    expect(reopened.provider.getLastCapsule()).toBeNull();
  });

  it("restores a chat whole when it fits in the window", async () => {
    const capsule = {
      requests: ["build a search page"],
      earlierRequests: 0,
      steps: [],
      earlierSteps: 0,
      note: "State: page built.",
      modelHistory: [user("now style it"), assistant("Styled.")],
      replacedEntries: 2,
    };
    // Summarised at 1K, reopened at 32K
    const { provider, sent } = connected(32768);
    provider.setChatHistory([
      ...chat,
      user("add paging"),
      { ...assistant("ok"), capsule },
    ]);
    await provider.chat("thanks");

    const [system, ...turns] = sent[0]!.messages;
    expect(system!.content).not.toContain("Earlier in this conversation");
    expect(turns).toHaveLength(7);
  });

  it("clears old tool results before going back to the summary", async () => {
    const capsule = {
      requests: ["build a search page"],
      earlierRequests: 0,
      steps: [],
      earlierSteps: 0,
      note: "State: page built.",
      modelHistory: [
        user("what does big.js do?"),
        assistant("I will read it."),
      ],
      replacedEntries: 2,
    };
    const readBig =
      '<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"C:/p/big.js"}</arguments>\n</tool_call>';
    const bigResult = `<tool_result trusted="false">\n<tool>read_text_file</tool>\n<result>\n${"y".repeat(3000)}\n</result>\n</tool_result>`;
    const { provider, sent } = connected(WINDOW);
    provider.setChatHistory([
      user("build a search page"),
      assistant("Built it."),
      user("what does big.js do?"),
      assistant(readBig),
      user(bigResult),
      { ...assistant("It sets x."), capsule },
      user("and y?"),
      assistant("Nothing."),
    ]);
    await provider.chat("thanks");

    // Clearing the file was enough: every turn stays, the summary unused
    const [system, ...turns] = sent[0]!.messages;
    expect(system!.content).not.toContain("Earlier in this conversation");
    expect(turns[0]!.content).toBe("build a search page");
    expect(turns[4]!.content).toContain("cleared to save space");
  });

  it("keeps a shortened model reply short after JSON restore", async () => {
    const longReply = `Recent answer. ${"x".repeat(3500)}`;
    const visible: SavedMessage[] = [
      user("old question"),
      assistant(`Old answer. ${"y".repeat(3500)}`),
      user("recent question"),
      assistant(longReply),
    ];
    const live = connected(1500, "State: old question answered.");
    live.provider.setChatHistory(visible);
    await live.provider.chat("follow up");
    const capsule = live.provider.getLastCapsule()!;
    expect(capsule.modelHistory[1]?.content.length).toBeLessThan(
      longReply.length
    );
    expect(visible[3]?.content).toBe(longReply);

    const savedMessages: SavedMessage[] = [
      ...visible,
      user("follow up"),
      { ...assistant("ok"), capsule },
    ];
    const roundTrip = JSON.parse(
      JSON.stringify(savedMessages)
    ) as SavedMessage[];
    expect(roundTrip[3]?.content).toBe(longReply);

    const reopened = connected(1500, "a duplicate note");
    reopened.provider.setChatHistory(roundTrip);
    await reopened.provider.chat("thanks");

    expect(reopened.sent).toHaveLength(1);
    const turns = reopened.sent[0]!.messages.slice(1);
    expect(turns[1]?.content).toBe(capsule.modelHistory[1]?.content);
    expect(turns[1]?.content).not.toBe(longReply);
  });

  it("keeps turns added after a full restore when the saved capsule is used later", async () => {
    const capsule = {
      requests: ["old question"],
      earlierRequests: 0,
      steps: [],
      earlierSteps: 0,
      note: "State: old question answered.",
      modelHistory: [user("kept question"), assistant("Kept answer.")],
      replacedEntries: 2,
    };
    const { provider, sent } = connected(WINDOW);
    provider.setChatHistory([
      user("old question"),
      assistant("Old answer. ".repeat(70)),
      user("kept question"),
      assistant("Kept answer."),
      user("saved request"),
      { ...assistant("Saved reply."), capsule },
    ]);

    await provider.chat("new turn");
    await provider.chat("z".repeat(2000));

    const lastStream = sent.filter((request) => request.stream).at(-1)!;
    expect(lastStream.messages[0]?.content).toContain(
      "State: old question answered."
    );
    expect(
      lastStream.messages.some((entry) => entry.content === "new turn")
    ).toBe(true);
    expect(lastStream.messages.some((entry) => entry.content === "ok")).toBe(
      true
    );
  });

  it("counts replaced model entries across a restore and another summary", async () => {
    const live = connected(WINDOW, "State: page built.");
    live.provider.setChatHistory(chat);
    await live.provider.chat("add paging");
    const first = live.provider.getLastCapsule()!;
    expect(first.replacedEntries).toBe(2);

    const reopened = connected(WINDOW, "State: styling done.");
    reopened.provider.setChatHistory([
      ...chat,
      user("add paging"),
      { ...assistant("ok"), capsule: first },
    ]);
    await reopened.provider.chat("w".repeat(740));
    await reopened.provider.chat("z".repeat(4000));
    expect(reopened.provider.getLastCapsule()?.replacedEntries).toBe(6);
  });
});

describe("LlamaServerProvider making room", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const readCall = (file: string) =>
    `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"C:/p/${file}"}</arguments>\n</tool_call>`;
  const readResult = (body: string) =>
    `<tool_result trusted="false">\n<tool>read_text_file</tool>\n<result>\n${body}\n</result>\n</tool_result>`;

  it("clears on past the trigger once it starts, oldest first", async () => {
    // ~1,090 tokens in a 1,750-token window: over 60%. Clearing the first
    // file alone gets under 60% but not 40%, so the second goes too; the
    // third and the latest exchange stay whole
    const { provider, sent } = connected(1750);
    provider.setChatHistory([
      user("read the four files"),
      assistant(readCall("a.js")),
      user(readResult("a".repeat(1000))),
      assistant(readCall("b.js")),
      user(readResult("b".repeat(450))),
      assistant(readCall("c.js")),
      user(readResult("c".repeat(450))),
      assistant(readCall("d.js")),
      user(readResult("d".repeat(450))),
      assistant("Read them all."),
    ]);
    await provider.chat("thanks");

    const turns = sent[0]!.messages.slice(1).map((m) => m.content);
    expect(turns).toHaveLength(11);
    expect(turns[2]).toContain("cleared to save space");
    expect(turns[4]).toContain("cleared to save space");
    expect(turns[6]).toContain("c".repeat(450));
    expect(turns[8]).toContain("d".repeat(450));
  });
});
