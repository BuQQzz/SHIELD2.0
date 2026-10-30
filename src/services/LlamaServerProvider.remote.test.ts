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
      max_tokens: 100,
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
