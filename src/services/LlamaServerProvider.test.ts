// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LlamaServerProvider, STALL_MS } from "./LlamaServerProvider";
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
    // the fake server reports 100 prompt + 5 reply tokens
    expect(session.getMeasuredContext()).toEqual({ used: 105, size: 4000 });
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

  it("gives up after STALL_MS with no bytes, instead of waiting forever", async () => {
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

    const outcome = provider.chat("hello").then(
      () => "returned",
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(STALL_MS + 1000);
    expect(await outcome).toContain("made no progress for 5 minutes");
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

    const outcome = provider.chat("hello").then(
      () => "returned",
      (error: Error) => error.message
    );
    await vi.advanceTimersByTimeAsync(STALL_MS + 61_000);
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
