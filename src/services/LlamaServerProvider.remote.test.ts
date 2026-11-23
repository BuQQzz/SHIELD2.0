// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LlamaServerProvider } from "./LlamaServerProvider";
import {
  ZdrNotConfirmedError,
  type RemoteEndpoint,
} from "./remote/remoteEndpoint";

const endpoint: RemoteEndpoint = {
  providerId: "exp-1",
  providerName: "Experiential Labs",
  baseUrl: "https://api.experientiallabs.ai/v1",
  apiKey: "xpl_secret0123456789",
  model: "deepseek-v4",
  contextSize: 32768,
  requireZdr: true,
};

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> & {
    messages: { role: string; content: string }[];
  };
}

/** A fake provider: streamed requests get `reply`, others get `note` */
function fakeProvider(
  responseHeaders: Record<string, string> | (() => Record<string, string>),
  reply = "Hello from the cloud.",
  note = "a note"
) {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Sent["body"];
      sent.push({ url, headers: init.headers as Record<string, string>, body });
      const headers =
        typeof responseHeaders === "function"
          ? responseHeaders()
          : responseHeaders;
      if (!body.stream) {
        return Response.json(
          { choices: [{ message: { content: note } }] },
          { headers }
        );
      }
      const events = [
        { choices: [{ delta: { content: reply } }] },
        { choices: [], usage: { prompt_tokens: 120, completion_tokens: 6 } },
      ];
      return new Response(
        [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]"]
          .map((line) => `${line}\n\n`)
          .join(""),
        { headers }
      );
    })
  );
  return sent;
}

const zdrHeaders = {
  "x-gateway-zdr": "true",
  "x-gateway-provider": "bedrock",
};

describe("LlamaServerProvider on a hosted model", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("is running once attached, with no process, until it is stopped", async () => {
    const provider = new LlamaServerProvider();
    expect(provider.isRunning()).toBe(false);
    await provider.attach(endpoint, "You are SHIELD.");
    expect(provider.isRunning()).toBe(true);
    expect(provider.getContextSize()).toBe(32768);
    await provider.stop();
    expect(provider.isRunning()).toBe(false);
  });

  it("sends a standard request with the key and the zero-retention demand", async () => {
    const sent = fakeProvider(zdrHeaders);
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "You are SHIELD.");

    const reply = await provider.chat("hi", {
      temperature: 0.2,
      maxTokens: 100,
    });
    expect(reply).toBe("Hello from the cloud.");

    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe(
      "https://api.experientiallabs.ai/v1/chat/completions"
    );
    expect(request?.headers.Authorization).toBe("Bearer xpl_secret0123456789");
    expect(request?.body).toMatchObject({
      model: "deepseek-v4",
      stream: true,
      temperature: 0.2,
      // Raised to the hosted floor: its thinking counts against it
      max_tokens: 32768,
      provider: { zdr: true },
    });
    expect(request?.body.messages).toEqual([
      { role: "system", content: "You are SHIELD." },
      { role: "user", content: "hi" },
    ]);
    for (const field of [
      "cache_prompt",
      "top_k",
      "repeat_penalty",
      "return_progress",
      "timings_per_token",
      "chat_template_kwargs",
    ]) {
      expect(request?.body).not.toHaveProperty(field);
    }
  });

  it("keeps the chat, reports the provider's token counts and how it was served", async () => {
    const sent = fakeProvider(zdrHeaders);
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "You are SHIELD.");

    await provider.chat("first");
    await provider.chat("second");
    expect(sent[1]?.body.messages.map((m) => m.content)).toEqual([
      "You are SHIELD.",
      "first",
      "Hello from the cloud.",
      "second",
    ]);

    expect(provider.getLastServedBy()).toMatchObject({
      provider: "bedrock",
      zdr: true,
    });
    expect(provider.getMeasuredContext()).toEqual({ used: 126, size: 32768 });
    expect(provider.getLastStats()?.outputTokens).toBe(6);
  });

  it("throws the reply away when zero retention is required and not confirmed", async () => {
    const sent = fakeProvider({ "x-gateway-zdr": "false" });
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "You are SHIELD.");

    await expect(provider.chat("secret plans")).rejects.toBeInstanceOf(
      ZdrNotConfirmedError
    );

    // Nothing of the exchange is in the chat: the next request has none of it
    const again = fakeProvider(zdrHeaders);
    await provider.chat("another");
    expect(again[0]?.body.messages.map((m) => m.content)).toEqual([
      "You are SHIELD.",
      "another",
    ]);
    expect(sent).toHaveLength(1);
  });

  it("is not held to it when zero retention is not required", async () => {
    fakeProvider({});
    const provider = new LlamaServerProvider();
    await provider.attach({ ...endpoint, requireZdr: false }, "p");
    await expect(provider.chat("hi")).resolves.toBe("Hello from the cloud.");
    expect(provider.getLastServedBy()?.zdr).toBeUndefined();
  });

  it("names the provider and keeps the key out of an HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "bad key" } }), {
            status: 401,
          })
      )
    );
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    const error = await provider.chat("hi").catch((e: Error) => e);
    expect((error as Error).message).toContain(
      "Experiential Labs rejected the key"
    );
    expect((error as Error).message).not.toContain("xpl_");
  });

  it("tries again after a rate limit, saying so, and keeps the chat as one turn", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // shortest waits
    let calls = 0;
    const ok = fakeProvider(zdrHeaders, "Done after the wait.");
    const real = globalThis.fetch as unknown as (
      url: string,
      init: RequestInit
    ) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls++;
        if (calls === 1)
          return new Response(JSON.stringify({ error: "slow down" }), {
            status: 429,
            headers: { "retry-after": "0" },
          });
        if (calls === 2) {
          throw Object.assign(new TypeError("fetch failed"), {
            cause: Object.assign(new Error("reset"), { code: "ECONNRESET" }),
          });
        }
        return real(url, init);
      })
    );
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    const progress: unknown[] = [];
    const reply = await provider.chat("hi", {
      onProgress: (p) => progress.push(p),
    });
    expect(reply).toBe("Done after the wait.");
    expect(calls).toBe(3);
    expect(ok).toHaveLength(1);
    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: "waiting",
        retry: { attempt: 1, reason: "Rate limited" },
      })
    );
    expect(progress).toContainEqual(
      expect.objectContaining({
        retry: { attempt: 2, reason: "Connection dropped" },
      })
    );
    // One user message and one reply: the failed tries left nothing behind
    const history = (provider as unknown as { history: unknown[] }).history;
    expect(history).toHaveLength(2);
  }, 15_000);

  it("asks once more at low effort when thinking used the whole reply, then says so", async () => {
    const bodies: Record<string, unknown>[] = [];
    let thoughtOut = 2;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        bodies.push(body);
        const events =
          thoughtOut-- > 0
            ? [
                {
                  choices: [
                    { delta: { reasoning_content: "hmm ".repeat(50) } },
                  ],
                },
                { choices: [{ delta: {}, finish_reason: "length" }] },
              ]
            : [{ choices: [{ delta: { content: "Writing models.py." } }] }];
        return new Response(
          [...events.map((e) => `data: ${JSON.stringify(e)}`), "data: [DONE]"]
            .map((line) => `${line}\n\n`)
            .join(""),
          { headers: zdrHeaders }
        );
      })
    );
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    // Thought out once: sent again at low effort with the note, and answered
    thoughtOut = 1;
    expect(await provider.chat("build it")).toBe("Writing models.py.");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.reasoning).toEqual({ effort: "low" });
    const last = (bodies[1]!.messages as { content: string }[]).at(-1)!;
    expect(last.content).toContain("whole reply limit");
    // Remembered for this model on Default: the next request thinks low
    expect(bodies[2]).toBeUndefined();
    thoughtOut = 0;
    await provider.chat("go on");
    expect(bodies[2]!.reasoning).toEqual({ effort: "low" });
    // Thought out both times: said plainly, not an empty turn
    thoughtOut = 2;
    await expect(provider.chat("next")).rejects.toThrow(
      /whole reply on thinking, twice/
    );
  });

  it("does not try again a request the provider refused as wrong", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return new Response("{}", { status: 400 });
      })
    );
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    await expect(provider.chat("hi")).rejects.toThrow(/HTTP 400/);
    expect(calls).toBe(1);
  });

  it("stops waiting to try again when the user presses Stop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", { status: 503, headers: { "retry-after": "60" } })
      )
    );
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    const stop = new AbortController();
    const reply = provider.chat("hi", {
      signal: stop.signal,
      onProgress: (p) => {
        if (p.phase === "waiting" && p.retry) stop.abort();
      },
    });
    await expect(reply).resolves.toBe("");
  });

  it("sends a title request the same way, and drops it if not confirmed", async () => {
    const sent = fakeProvider(zdrHeaders, "ok", "Weather in Paris");
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    await expect(provider.generateTitle("what is the weather")).resolves.toBe(
      "Weather in Paris"
    );
    expect(sent[0]?.headers.Authorization).toBe("Bearer xpl_secret0123456789");
    expect(sent[0]?.body.provider).toEqual({ zdr: true });

    fakeProvider({}, "ok", "Weather in Paris");
    await expect(
      provider.generateTitle("what is the weather")
    ).rejects.toBeInstanceOf(ZdrNotConfirmedError);
  });

  it("puts who served the reply in the stats, and times the whole reply", async () => {
    fakeProvider(zdrHeaders);
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    await provider.chat("hi");
    const stats = provider.getLastStats();
    expect(stats?.servedBy).toEqual({ provider: "bedrock", zdr: true });
    expect(stats?.outputTokens).toBe(6);
    expect(stats?.tokensPerSecond).toBeGreaterThan(0);
  });

  it("leaves a local server's stats without a provider", async () => {
    fakeProvider({});
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://127.0.0.1:9999",
      contextSize: 8192,
    });
    await provider.chat("hi");
    expect(provider.getLastStats()).not.toHaveProperty("servedBy");
  });

  it("gives a thinking model room for its thought when it writes a title", async () => {
    const sent = fakeProvider(zdrHeaders, "ok", "Weather in Paris");
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    await provider.generateTitle("what is the weather");
    expect(sent[0]?.body.max_tokens).toBe(400);
  });

  it("titles the chat from the message when the model returned no title", async () => {
    fakeProvider(zdrHeaders, "ok", "");
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    await expect(
      provider.generateTitle("how do I fix this bug in my code today please")
    ).resolves.toBe("how do I fix this bug...");
  });

  it("lets a sub-agent chat on the same provider, with its own history", async () => {
    const sent = fakeProvider(zdrHeaders);
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "orchestrator");

    const agent = provider.fork("coder", { keepWholeHistory: true });
    await agent.chat("write it");
    expect(sent[0]?.headers.Authorization).toBe("Bearer xpl_secret0123456789");
    expect(sent[0]?.body.messages[0]).toEqual({
      role: "system",
      content: "coder",
    });
    expect(sent[0]?.body.provider).toEqual({ zdr: true });
  });

  it("puts an agent's cost on the main session's next reply", async () => {
    const sent = fakeProvider(zdrHeaders);
    const provider = new LlamaServerProvider();
    await provider.attach(
      { ...endpoint, pricing: { input: 1, output: 1 } },
      "orchestrator"
    );
    const agent = provider.fork("coder", { keepWholeHistory: true });
    await agent.chat("write it");
    // 120 + 6 tokens at $1 per million each
    expect(agent.getLastStats()?.cost).toBeUndefined();
    await provider.chat("go on");
    expect(provider.getLastStats()?.cost).toBeCloseTo(2 * 126e-6, 12);
    expect(sent).toHaveLength(2);
  });

  it("sends the user's thinking level, and goes on without it when refused", async () => {
    const sent: Sent["body"][] = [];
    let refuse = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string) as Sent["body"];
        sent.push(body);
        if (refuse) {
          refuse = false;
          return new Response('{"error":"reasoning effort not supported"}', {
            status: 400,
          });
        }
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\ndata: [DONE]\n\n`,
          { headers: zdrHeaders }
        );
      })
    );
    const provider = new LlamaServerProvider();
    await provider.attach({ ...endpoint }, "You are SHIELD.");
    provider.setThinkingLevel("max");
    expect(await provider.chat("hi")).toBe("ok");
    expect(sent[0]?.reasoning).toEqual({ effort: "max" });
    expect(sent[1]).not.toHaveProperty("reasoning");
  });

  it("sizes the context from estimates, asking the provider for no tokenizer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("no request expected");
      })
    );
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "You are SHIELD.");
    provider.setChatHistory([
      { role: "user", content: "x".repeat(300) },
      { role: "assistant", content: "y".repeat(300) },
    ]);
    const breakdown = await provider.getContextBreakdown();
    expect(breakdown?.size).toBe(32768);
    expect(breakdown?.used).toBeGreaterThan(150);
  });

  it("tidies a long chat at 128K though the window is larger, and writes no summary", async () => {
    const sent = fakeProvider(zdrHeaders);
    const provider = new LlamaServerProvider();
    await provider.attach(
      { ...endpoint, contextSize: 655360 },
      "You are SHIELD."
    );
    const call = (file: string) =>
      `<tool_call>\n<server>filesystem</server>\n<tool>read_text_file</tool>\n<arguments>{"path":"C:/p/${file}"}</arguments>\n</tool_call>`;
    const result = (body: string) =>
      `<tool_result trusted="false">\n<tool>read_text_file</tool>\n<result>\n${body}\n</result>\n</tool_result>`;
    // ~120K tokens: past 60% of 128K, far inside 60% of the window
    const history: { role: "user" | "assistant"; content: string }[] = [
      { role: "user", content: "read the files" },
    ];
    for (const file of ["a", "b", "c", "d", "e", "f"]) {
      history.push(
        { role: "assistant", content: call(`${file}.js`) },
        { role: "user", content: result(file.repeat(60000)) }
      );
    }
    history.push({ role: "assistant", content: "Read them all." });
    provider.setChatHistory(
      history as Parameters<typeof provider.setChatHistory>[0]
    );
    await provider.chat("thanks");

    // One streamed request: no summary was asked for
    expect(sent).toHaveLength(1);
    const turns = sent[0]!.body.messages.slice(1).map((m) => m.content);
    expect(turns[2]).toContain("removed from your context to save space");
    expect(turns.at(-3)).toContain("f".repeat(60000));
  });

  it("has no server to restart: a restart leaves the chat as it is", async () => {
    const provider = new LlamaServerProvider();
    await provider.attach(endpoint, "p");
    await expect(provider.restartServer()).resolves.toBeUndefined();
    expect(provider.isRunning()).toBe(true);
  });

  it("still sends llama-server its own fields, with no key", async () => {
    const sent = fakeProvider({});
    const provider = new LlamaServerProvider();
    Object.assign(provider, {
      process: { exitCode: null },
      baseUrl: "http://127.0.0.1:9999",
      contextSize: 8192,
    });
    await provider.chat("hi");

    expect(sent[0]?.url).toBe("http://127.0.0.1:9999/v1/chat/completions");
    expect(sent[0]?.headers).toEqual({ "Content-Type": "application/json" });
    expect(sent[0]?.body).toMatchObject({
      cache_prompt: true,
      top_k: 40,
      repeat_penalty: 1.1,
      return_progress: true,
    });
    expect(sent[0]?.body).not.toHaveProperty("model");
    expect(sent[0]?.body).not.toHaveProperty("provider");
  });
});
