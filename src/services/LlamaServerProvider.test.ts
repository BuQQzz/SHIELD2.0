// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LlamaServerProvider,
  replyTokenLimit,
  STALL_MS,
  MIN_REPLY_TOKENS,
  nextPromptTokens,
  overflowedPrompt,
} from "./LlamaServerProvider";
import { NUDGE_NOTE } from "./llamaServer/rescue";
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
    expect(turns[4]!.content).toContain(
      "removed from your context to save space"
    );
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
    // Over 60% of a 2,200-token window. Clearing the first file alone gets
    // under 60% but not 40%, so the second goes too; the third and the
    // latest exchange stay whole. (Sizes fit the removal notes' length.)
    const { provider, sent } = connected(2200);
    provider.setChatHistory([
      user("read the four files"),
      assistant(readCall("a.js")),
      user(readResult("a".repeat(1000))),
      assistant(readCall("b.js")),
      user(readResult("b".repeat(700))),
      assistant(readCall("c.js")),
      user(readResult("c".repeat(700))),
      assistant(readCall("d.js")),
      user(readResult("d".repeat(700))),
      assistant("Read them all."),
    ]);
    await provider.chat("thanks");

    const turns = sent[0]!.messages.slice(1).map((m) => m.content);
    expect(turns).toHaveLength(11);
    expect(turns[2]).toContain("removed from your context to save space");
    expect(turns[4]).toContain("removed from your context to save space");
    expect(turns[6]).toContain("c".repeat(700));
    expect(turns[8]).toContain("d".repeat(700));
  });
});

describe("LlamaServerProvider context count", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("still counts a new chat when the template refuses one with no user message", async () => {
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 4096,
      systemPrompt: "You are a helpful assistant.",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/apply-template")) {
          return Response.json(
            {
              error: {
                code: 500,
                message: "raise_exception('No user query found in messages.')",
              },
            },
            { status: 500 }
          );
        }
        // /tokenize: one token per word
        return Response.json({ tokens: [1, 2, 3, 4, 5] });
      })
    );

    const usage = await provider.getContextUsage();

    expect(usage).not.toBeNull();
    expect(usage?.size).toBe(4096);
    expect(usage?.used).toBeGreaterThan(0);
  });

  it("asks for a title with thinking off, so a thinking model has tokens left to answer", async () => {
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 4096,
    });
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return Response.json({
          choices: [{ message: { content: "Capital of France" } }],
        });
      })
    );

    expect(await provider.generateTitle("What is the capital of France?")).toBe(
      "Capital of France"
    );
    expect(bodies[0]?.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});

describe("LlamaServerProvider forked sessions", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("gives a session its own prompt and history, and leaves the main chat alone", async () => {
    const { provider, sent } = connected(4000, "", "done");
    provider.applySystemPrompt("You are the orchestrator.");
    await provider.chat("plan the work");

    const session = provider.fork("You are the coder.");
    await session.chat("write add.sh");
    await session.chat("now the tests");
    await provider.chat("and then?");

    const sessionRequests = sent.filter((r) =>
      r.messages[0]?.content.includes("coder")
    );
    expect(sessionRequests).toHaveLength(2);
    // the second coder request carries the coder's first turn, nothing of the orchestrator's
    expect(sessionRequests[1]?.messages.map((m) => m.content)).toEqual([
      "You are the coder.",
      "write add.sh",
      "done",
      "now the tests",
    ]);
    const mainRequests = sent.filter((r) =>
      r.messages[0]?.content.includes("orchestrator")
    );
    expect(mainRequests.at(-1)?.messages.map((m) => m.content)).toEqual([
      "You are the orchestrator.",
      "plan the work",
      "done",
      "and then?",
    ]);
  });

  it("measures how full the window is from the server's own count", async () => {
    const { provider } = connected(4000, "", "ok");
    const session = provider.fork("You are the tester.");
    expect(session.getMeasuredContext()).toEqual({ used: 0, size: 4000 });
    await session.chat("run the tests");
    // the fake server reports 100 prompt + 5 reply tokens; the reply is
    // "ok", one token as it stays in the history (nextPromptTokens)
    expect(session.getMeasuredContext()).toEqual({ used: 101, size: 4000 });
    expect(provider.getMeasuredContext().used).toBe(0);
  });

  it("follows the server it was forked from, and cannot start or stop it", async () => {
    const { provider } = connected(4000);
    const session = provider.fork("x");
    expect(session.isRunning()).toBe(true);

    await session.stop();
    expect(provider.isRunning()).toBe(true);
    await expect(
      session.load({ modelPath: "m.gguf", contextSize: 1, systemPrompt: "x" })
    ).rejects.toThrow("cannot start a server");

    Object.assign(provider, { process: { exitCode: 1 } });
    expect(session.isRunning()).toBe(false);
    expect(() => provider.fork("y")).toThrow("No model loaded");
  });

  it("keeps a sub-agent's whole history instead of clearing or summarising it", async () => {
    const call = (file: string) =>
      `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/p/${file}"}</arguments>\n</tool_call>`;
    const result = (body: string) =>
      `<tool_result trusted="false">\n<tool>read_text_file</tool>\n<result>\n${body}\n</result>\n</tool_result>`;
    const history = [
      user("read the four files"),
      assistant(call("a.js")),
      user(result("a".repeat(1000))),
      assistant(call("b.js")),
      user(result("b".repeat(700))),
      assistant(call("c.js")),
      user(result("c".repeat(700))),
      assistant(call("d.js")),
      user(result("d".repeat(700))),
      assistant("Read them all."),
    ];
    const { provider, sent } = connected(2200);

    const plain = provider.fork("You are the coder.");
    plain.setChatHistory(history);
    await plain.chat("thanks");
    const keeping = provider.fork("You are the coder.", {
      keepWholeHistory: true,
    });
    keeping.setChatHistory(history);
    await keeping.chat("thanks");

    const turnsOf = (request: SentRequest | undefined) =>
      request?.messages.slice(1).map((m) => m.content) ?? [];
    expect(turnsOf(sent[0])[2]).toContain("removed from your context");
    expect(turnsOf(sent[1])[2]).toContain("a".repeat(1000));
    expect(turnsOf(sent[1])[4]).toContain("b".repeat(700));
  });
});

describe("LlamaServerProvider a server that goes silent", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("restarts the server after STALL_MS with no bytes, then gives up if it stalls again", async () => {
    vi.useFakeTimers();
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 32768,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        // Headers arrive, then the body never says anything
        const body = new ReadableStream({
          start(controller) {
            init.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError"))
            );
          },
        });
        return new Response(body);
      })
    );

    const restart = vi
      .spyOn(provider, "restartServer")
      .mockResolvedValue(undefined);

    const outcome = provider.chat("hello").then(
      () => "returned",
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(STALL_MS + 1000);
    expect(restart).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(STALL_MS + 1000);
    expect(await outcome).toContain(
      "made no progress for 5 minutes, also after a restart"
    );
    expect(restart).toHaveBeenCalledTimes(1);
  });

  // The second hang (2026-10-21): the server's main thread spun at 100% and
  // sent a few bytes now and then, which kept a byte-based timer from firing
  it("still gives up when the server keeps sending bytes but no progress", async () => {
    vi.useFakeTimers();
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 32768,
    });
    const tokens = (n: number) =>
      `data: ${JSON.stringify({ choices: [{ delta: {} }], timings: { predicted_n: n } })}\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const encoder = new TextEncoder();
        let ping: ReturnType<typeof setInterval>;
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(tokens(151)));
            // A repeat of the last count, and a comment line: no progress
            ping = setInterval(() => {
              controller.enqueue(
                encoder.encode(`: keep-alive\n\n${tokens(151)}`)
              );
            }, 60_000);
            init.signal?.addEventListener("abort", () => {
              clearInterval(ping);
              controller.error(new DOMException("aborted", "AbortError"));
            });
          },
        });
        return new Response(body);
      })
    );

    vi.spyOn(provider, "restartServer").mockResolvedValue(undefined);

    const outcome = provider.chat("hello").then(
      () => "returned",
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(2 * (STALL_MS + 61_000));
    expect(await outcome).toContain("made no progress for 5 minutes");
  });
});

// Live (2026-10-26): the prompt read set the one progress mark to 7,161,
// a thinking reply's count stayed under it, and a server writing 22 tok/s
// was given up on 5 minutes after the read
describe("LlamaServerProvider a long thinking reply after a long prompt", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("counts every new token as progress, though fewer than the prompt", async () => {
    vi.useFakeTimers();
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 32768,
    });
    const event = (body: object) => `data: ${JSON.stringify(body)}\n\n`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const encoder = new TextEncoder();
        let tick: ReturnType<typeof setInterval>;
        let n = 0;
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                event({
                  prompt_progress: {
                    processed: 7161,
                    total: 7161,
                    cache: 3756,
                  },
                })
              )
            );
            // A token a minute, timings only (thinking is not content):
            // 7 minutes, past STALL_MS, and still under 7,161
            tick = setInterval(() => {
              n += 1;
              if (n > 7) {
                clearInterval(tick);
                controller.enqueue(
                  encoder.encode(
                    event({ choices: [{ delta: { content: "Done." } }] })
                  )
                );
                controller.close();
                return;
              }
              controller.enqueue(
                encoder.encode(
                  event({
                    choices: [{ delta: {} }],
                    timings: { predicted_n: n * 400 },
                  })
                )
              );
            }, 60_000);
            init.signal?.addEventListener("abort", () => {
              clearInterval(tick);
              controller.error(new DOMException("aborted", "AbortError"));
            });
          },
        });
        return new Response(body);
      })
    );

    const outcome = provider.chat("hello").then(
      (reply) => reply,
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(await outcome).toContain("Done.");
  });
});

describe("LlamaServerProvider thinking in circles", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("drops a reply whose thinking repeats itself and sends it again without thinking", async () => {
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 32768,
    });
    const loop =
      "Wait, the file is calc.py, not calcul.py. Let me read calc.py again. Actually I listed it already. ";
    const sent: { chat_template_kwargs?: { enable_thinking?: boolean } }[] = [];
    let aborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        sent.push(body);
        const encoder = new TextEncoder();
        const event = (delta: object) =>
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`
          );
        if (body.chat_template_kwargs?.enable_thinking === false) {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(event({ content: "Reading calc.py." }));
                controller.close();
              },
            })
          );
        }
        // Thinks the same passage over and over, and would never stop
        let timer: ReturnType<typeof setInterval>;
        return new Response(
          new ReadableStream({
            start(controller) {
              timer = setInterval(
                () => controller.enqueue(event({ reasoning_content: loop })),
                1
              );
              init.signal?.addEventListener("abort", () => {
                aborted = true;
                clearInterval(timer);
                controller.error(new DOMException("aborted", "AbortError"));
              });
            },
          })
        );
      })
    );

    expect(await provider.chat("next step?")).toBe("Reading calc.py.");
    expect(aborted).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.chat_template_kwargs).toBeUndefined();
    expect(sent[1]!.chat_template_kwargs).toEqual({ enable_thinking: false });
    // the history holds the message once, with the answer that was kept
    expect(
      (provider as unknown as { history: { content: string }[] }).history.map(
        (m) => m.content
      )
    ).toEqual(["next step?", "Reading calc.py."]);
  });
});

describe("LlamaServerProvider SHIELD_SERVER_LOG", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("notes each request in the file it names, and nothing without it", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shield-log-"));
    const file = path.join(dir, "server.log");
    vi.stubEnv("SHIELD_SERVER_LOG", file);
    const { provider } = connected(32768);
    await provider.chat("hello", { thinking: false });
    expect(fs.readFileSync(file, "utf8")).toMatch(
      /^\d{4}-\d\d-\d\dT[\d:.]+Z \[SHIELD\] chat request, thinking off\n$/
    );
    vi.stubEnv("SHIELD_SERVER_LOG", "");
    await provider.chat("again");
    expect(fs.readFileSync(file, "utf8").split("\n")).toHaveLength(2);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("saves the request that stalled, to send it again to a fresh server", async () => {
    vi.useFakeTimers();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shield-log-"));
    const file = path.join(dir, "server.log");
    vi.stubEnv("SHIELD_SERVER_LOG", file);
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 32768,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith("/slots")) return new Response("[]");
        const body = new ReadableStream({
          start(controller) {
            init.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError"))
            );
          },
        });
        return new Response(body);
      })
    );

    const outcome = provider.chat("fix calc.py").catch(() => "stalled");
    await vi.advanceTimersByTimeAsync(STALL_MS + 1000);
    expect(await outcome).toBe("stalled");
    vi.useRealTimers();

    const log = fs.readFileSync(file, "utf8");
    expect(log).toContain("no progress for 5 minutes");
    const saved = /the stalled request was saved to (\S+)/.exec(log)?.[1];
    const request = JSON.parse(fs.readFileSync(saved!, "utf8"));
    expect(request.messages.at(-1)).toEqual({
      role: "user",
      content: "fix calc.py",
    });
    expect(request.stream).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

// The stuck bar (rescue.ts): the user cuts off one request, not the turn
describe("LlamaServerProvider a request the user rescues", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /**
   * The first request writes "going round" and then hangs until cut off;
   * every later one answers "done"
   */
  function stuckOnce() {
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 32768,
    });
    const sent: (SentRequest & {
      chat_template_kwargs?: { enable_thinking: boolean };
    })[] = [];
    const urls: string[] = [];
    const encoder = new TextEncoder();
    const line = (event: object) =>
      encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        urls.push(url);
        sent.push(JSON.parse(init.body as string));
        const first = sent.length === 1;
        const body = new ReadableStream({
          start(controller) {
            if (!first) {
              controller.enqueue(
                line({ choices: [{ delta: { content: "done" } }] })
              );
              controller.close();
              return;
            }
            controller.enqueue(
              line({ choices: [{ delta: { content: "going round" } }] })
            );
            init.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("aborted", "AbortError"))
            );
          },
        });
        return new Response(body);
      })
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    return { provider, sent, urls };
  }

  const writing = (provider: LlamaServerProvider) =>
    vi.waitFor(() => expect(provider.requestStatus()?.phase).toBe("writing"));

  it("has nothing to cut off when no request runs", () => {
    const { provider } = stuckOnce();
    expect(provider.requestStatus()).toBeNull();
    expect(provider.rescue("nudge")).toBe(false);
  });

  it("nudge: sends the message again without thinking, with a note", async () => {
    const { provider, sent } = stuckOnce();
    const reply = provider.chat("fix calc.py");
    await writing(provider);
    expect(provider.requestStatus()?.agent).toBe(false);

    expect(provider.rescue("nudge")).toBe(true);
    expect(await reply).toBe("done");
    expect(sent).toHaveLength(2);
    expect(sent[1]!.messages.at(-1)?.content).toBe(`fix calc.py${NUDGE_NOTE}`);
    expect(sent[1]!.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(provider.requestStatus()).toBeNull();
  });

  it("skip: ends an agent's request with what was written, and sends nothing more", async () => {
    const { provider, sent } = stuckOnce();
    const reply = provider.fork("You are the coder.").chat("fix calc.py");
    await writing(provider);

    expect(provider.rescue("skip")).toBe(true);
    expect(await reply).toBe("going round");
    expect(sent).toHaveLength(1);
  });

  // The bar offered Skip for the coder's request; by the click the
  // orchestrator's was the one running
  it("skip: leaves a request that is not an agent's alone", async () => {
    const { provider } = stuckOnce();
    void provider.chat("fix calc.py").catch(() => {});
    await writing(provider);

    expect(provider.rescue("skip")).toBe(false);
    expect(provider.requestStatus()).not.toBeNull();
    provider.stopGeneration();
  });

  it("restart: restarts the server and sends the same message again", async () => {
    const { provider, sent } = stuckOnce();
    const restart = vi
      .spyOn(provider, "restartServer")
      .mockResolvedValue(undefined);
    const reply = provider.chat("fix calc.py");
    await writing(provider);

    provider.rescue("restart");
    expect(await reply).toBe("done");
    expect(restart).toHaveBeenCalledTimes(1);
    expect(sent[1]!.messages.at(-1)?.content).toBe("fix calc.py");
  });

  it("reaches an agent's request from the main server, which a restart moves", async () => {
    const { provider, urls } = stuckOnce();
    vi.spyOn(provider, "restartServer").mockImplementation(async () => {
      Object.assign(provider, { baseUrl: "http://restarted" });
    });
    const agent = provider.fork("You are the coder.");
    const reply = agent.chat("fix calc.py");
    await writing(provider);
    expect(provider.requestStatus()?.agent).toBe(true);

    expect(provider.rescue("restart")).toBe(true);
    expect(await reply).toBe("done");
    expect(urls[1]).toBe("http://restarted/v1/chat/completions");
  });
});

describe("replyTokenLimit", () => {
  it("raises a small setting to the minimum", () => {
    expect(replyTokenLimit(2048)).toBe(MIN_REPLY_TOKENS);
    expect(replyTokenLimit(undefined)).toBe(MIN_REPLY_TOKENS);
  });

  it("keeps a larger setting", () => {
    expect(replyTokenLimit(16384)).toBe(16384);
  });
});

describe("nextPromptTokens", () => {
  it("counts the visible reply, not the thought that is not sent back", () => {
    // 5,000 tokens of thinking and a 300-character answer
    expect(
      nextPromptTokens(
        { prompt_tokens: 9000, completion_tokens: 5100 },
        "x".repeat(300)
      )
    ).toBe(9100);
  });

  it("never counts more than the reply's tokens", () => {
    expect(
      nextPromptTokens(
        { prompt_tokens: 100, completion_tokens: 10 },
        "x".repeat(300)
      )
    ).toBe(110);
  });
});

describe("reasoning effort", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is sent with a reply that thinks, and kept by forked sessions", async () => {
    const { provider, sent } = connected(8000);
    Object.assign(provider, { reasoningEffort: "medium" });
    await provider.chat("plan the kit");
    expect((sent[0] as { reasoning_effort?: string }).reasoning_effort).toBe(
      "medium"
    );
    await provider.fork("You are the coder.").chat("go");
    expect((sent[1] as { reasoning_effort?: string }).reasoning_effort).toBe(
      "medium"
    );
  });

  it("is left out when thinking is off, or when the model has none", async () => {
    const { provider, sent } = connected(8000);
    Object.assign(provider, { reasoningEffort: "medium" });
    await provider.chat("hi", { thinking: false });
    expect(sent[0]).not.toHaveProperty("reasoning_effort");
    Object.assign(provider, { reasoningEffort: undefined });
    await provider.chat("hi");
    expect(sent[1]).not.toHaveProperty("reasoning_effort");
  });
});

describe("presence penalty", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is sent with every request when the model sets one, forks included", async () => {
    const { provider, sent } = connected(8000);
    Object.assign(provider, { presencePenalty: 1.5 });
    await provider.chat("write the kit", { thinking: false });
    expect(sent[0]).toHaveProperty("presence_penalty", 1.5);
    await provider.fork("You are the coder.").chat("go");
    expect(sent[1]).toHaveProperty("presence_penalty", 1.5);
  });

  it("is left out for a model that sets none", async () => {
    const { provider, sent } = connected(8000);
    await provider.chat("hi");
    expect(sent[0]).not.toHaveProperty("presence_penalty");
  });
});

describe("native tool calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the tools and turns streamed calls into SHIELD's text form", async () => {
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 8000,
    });
    provider.applySystemPrompt("You are SHIELD.", [
      {
        name: "web_search",
        description: "Search",
        serverName: "web",
        inputSchema: { type: "object" },
      },
    ]);
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        const events = [
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { name: "web_search", arguments: '{"query":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, function: { arguments: '"radio"}' } },
                  ],
                },
              },
            ],
          },
          { choices: [], usage: { prompt_tokens: 50, completion_tokens: 9 } },
        ];
        return new Response(
          [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]"]
            .map((l) => `${l}\n\n`)
            .join("")
        );
      })
    );
    const streamed: string[] = [];
    const reply = await provider.chat("find radio prices", {
      onToken: (t) => streamed.push(t),
    });

    expect(bodies[0]!.tools).toEqual([
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search",
          parameters: { type: "object" },
        },
      },
    ]);
    const text =
      typeof reply === "string"
        ? reply
        : (reply as { response: string }).response;
    expect(streamed.join("")).toBe(text);
    expect(text).toBe(
      '<tool_call>\n<server>web</server>\n<tool>web_search</tool>\n<arguments>{"query":"radio"}</arguments>\n</tool_call>\n'
    );
  });

  it("sends a message whose reply came back empty once more, without thinking", async () => {
    const { provider, sent } = connected(8000);
    const replies = ["", "Done."];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(init.body as string));
        const content = replies.shift() ?? "";
        const events = content ? [{ choices: [{ delta: { content } }] }] : [];
        return new Response(
          [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]"]
            .map((l) => `${l}\n\n`)
            .join("")
        );
      })
    );
    const reply = await provider.chat("add the section");
    const text =
      typeof reply === "string"
        ? reply
        : (reply as { response: string }).response;
    expect(text).toBe("Done.");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toHaveProperty(
      "chat_template_kwargs.enable_thinking",
      false
    );
  });

  it("ends a reply that writes a made-up result as text, and keeps what came before", async () => {
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 8000,
    });
    provider.applySystemPrompt("You are SHIELD.", [
      {
        name: "read_text_file",
        description: "Read",
        inputSchema: { type: "object" },
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const events = [
          "I read the file. ",
          "You executed 1 tool call(s). Here",
          " are the results: # made up",
        ].map((content) => ({ choices: [{ delta: { content } }] }));
        return new Response(
          [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]"]
            .map((l) => `${l}\n\n`)
            .join("")
        );
      })
    );
    const reply = await provider.chat("read a.md");
    const text =
      typeof reply === "string"
        ? reply
        : (reply as { response: string }).response;
    expect(text).toBe("I read the file.");
  });

  it("ends a reply whose call ran on into a result it wrote, and keeps the repaired call", async () => {
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://server",
      contextSize: 8000,
    });
    provider.applySystemPrompt("You are SHIELD.", [
      {
        name: "read_text_file",
        description: "Read",
        inputSchema: { type: "object" },
      },
    ]);
    const bodies: Record<string, unknown>[] = [];
    const piece = (args: string, name?: string) => ({
      choices: [
        {
          delta: {
            tool_calls: [{ index: 0, function: { name, arguments: args } }],
          },
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        const events = [
          piece(
            '{"path":"/p/a.md</parameter>\\n</function>\\n</tool_call>\\n',
            "read_text_file"
          ),
          piece("You executed 1 tool call(s). Here are the results:\\n"),
          piece("# A file it made up"),
        ];
        return new Response(
          [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]"]
            .map((l) => `${l}\n\n`)
            .join("")
        );
      })
    );
    const reply = await provider.chat("read a.md");
    const text =
      typeof reply === "string"
        ? reply
        : (reply as { response: string }).response;
    expect(text).not.toContain("made up");

    await provider.chat("go on");
    const messages = bodies[1]!.messages as { role: string; content: string }[];
    expect(messages[2]!.content).toBe(
      '<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/p/a.md"}</arguments>\n</tool_call>\n'
    );
  });

  it("sends no tools when none are set, and none from a forked session", async () => {
    const { provider, sent } = connected(8000);
    await provider.chat("hi");
    expect(sent[0]).not.toHaveProperty("tools");
    provider.applySystemPrompt("x", [
      { name: "web_search", description: "Search" },
    ]);
    await provider.fork("You are the coder.").chat("go");
    expect(sent[1]).not.toHaveProperty("tools");
  });
});

describe("a prompt over the window", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const refusal = (tokens: number) =>
    JSON.stringify({
      error: {
        code: 400,
        message: `request (${tokens} tokens) exceeds the available context size (1000 tokens), try increasing it`,
        type: "exceed_context_size_error",
        n_prompt_tokens: tokens,
        n_ctx: 1000,
      },
    });

  it("reads the prompt's size from llama-server's refusal", () => {
    expect(overflowedPrompt(refusal(9351))).toBe(9351);
    expect(
      overflowedPrompt('{"error":{"code":400,"type":"invalid_request_error"}}')
    ).toBeNull();
    expect(overflowedPrompt("Bad Request")).toBeNull();
  });

  /** A server that refuses the first `refusals` chat requests as too long */
  function refusing(refusals: number) {
    const { provider, sent } = connected(WINDOW);
    const ok = vi.mocked(fetch).getMockImplementation()!;
    let left = refusals;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.stream && left-- > 0) {
        sent.push(body);
        return new Response(refusal(1400), { status: 400 });
      }
      return ok(url, init);
    });
    return { provider, sent };
  }

  it("makes room from the server's count and sends the message once more", async () => {
    // Small by SHIELD's estimate, so no room is made before the first try
    const { provider, sent } = refusing(1);
    provider.setChatHistory([
      user("read the file"),
      assistant(`Here it is. ${"x".repeat(1200)}`),
      user("thanks"),
      assistant("Done."),
    ]);

    expect(await provider.chat("one more thing")).toBe("ok");

    const chats = sent.filter((b) => b.stream);
    expect(chats).toHaveLength(2);
    const length = (b: SentRequest) =>
      b.messages.reduce((n, m) => n + m.content.length, 0);
    expect(length(chats[1]!)).toBeLessThan(length(chats[0]!));
  });

  it("clears the latest exchange's tool payloads too before sending once more", async () => {
    const { provider, sent } = refusing(1);
    provider.setChatHistory([
      user("add a section"),
      assistant(
        `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/p/a.md"}</arguments>\n</tool_call>`
      ),
      user(
        `<tool_result trusted="false">\n<tool>read_text_file</tool>\n<result>\n${"a".repeat(1500)}\n</result>\n</tool_result>`
      ),
    ]);

    await provider.chat("one more thing");

    const chats = sent.filter((b) => b.stream);
    expect(chats).toHaveLength(2);
    expect(JSON.stringify(chats[0]!.messages)).toContain("a".repeat(1500));
    expect(JSON.stringify(chats[1]!.messages)).not.toContain("a".repeat(1500));
  });

  it("gives up when the prompt is refused again", async () => {
    const { provider } = refusing(2);
    provider.setChatHistory([user("hi"), assistant("hello")]);

    await expect(provider.chat("one more thing")).rejects.toThrow(
      /exceeds the available context size/
    );
  });

  it("counts the native tool definitions in the window", async () => {
    // 2,400 characters of tools in a 1,000-token window: with the history
    // below, over the trigger only when they are counted
    const { provider, sent } = connected(WINDOW);
    provider.applySystemPrompt("You are SHIELD.", [
      {
        name: "web_search",
        serverName: "web",
        description: "d".repeat(2400),
        inputSchema: { type: "object" },
      },
    ]);
    provider.setChatHistory([
      user("read the file"),
      assistant(`Here it is. ${"x".repeat(600)}`),
      user("thanks"),
      assistant("Done."),
    ]);

    await provider.chat("one more thing");

    // Room was made: a note was asked for before the reply
    expect(sent[0]!.stream).toBeFalsy();
  });
});

describe("a reply that repeats the last one", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const read =
    'Let me read the file.\n\n<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/p/a.md"}</arguments>\n</tool_call>';

  it("is asked for once more when it repeats a call, sampled more loosely", async () => {
    const { provider, sent } = connected(8000, "", read);
    provider.setChatHistory([user("add a section"), assistant(read)]);

    await provider.chat("You already made this exact call");

    const chats = sent.filter((b) => b.stream) as (SentRequest & {
      temperature?: number;
    })[];
    expect(chats).toHaveLength(2);
    expect(chats[1]!.temperature).toBeCloseTo(1);
    // Kept, the second time: once is all it is asked again
    expect(provider["history"].at(-1)?.content).toBe(read);
  });

  it("is kept at once when it differs, or is a plain answer", async () => {
    const { provider, sent } = connected(8000, "", "Done.");
    provider.setChatHistory([user("add a section"), assistant(read)]);
    await provider.chat("the file");
    provider.setChatHistory([user("thanks"), assistant("Done.")]);
    await provider.chat("thanks again");

    expect(sent.filter((b) => b.stream)).toHaveLength(2);
  });
});

describe("the history with native calls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const call =
    '<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"/p/a.md"}</arguments>\n</tool_call>';
  const result =
    'You executed 1 tool call(s). Here are the results:\n\n<tool_result trusted="false">\n<tool>read_text_file</tool>\n<result>\n# Kit\n</result>\n</tool_result>';

  it("is sent as tool_calls and tool messages, and kept as text", async () => {
    const { provider, sent } = connected(8000);
    provider.applySystemPrompt("You are SHIELD.", [
      { name: "read_text_file", description: "Read", inputSchema: {} },
    ]);
    provider.setChatHistory([user("read a.md"), assistant(call)]);

    await provider.chat(result);

    const messages = sent[0]!.messages as unknown as Record<string, unknown>[];
    expect(messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(messages[2]!.tool_calls).toHaveLength(1);
    expect(provider["history"][1]!.content).toBe(call);
  });

  it("stays text for a model without native calls", async () => {
    const { provider, sent } = connected(8000);
    provider.setChatHistory([user("read a.md"), assistant(call)]);

    await provider.chat(result);

    expect(sent[0]!.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });
});
