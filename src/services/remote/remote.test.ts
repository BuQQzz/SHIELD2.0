// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  adaptRequestBody,
  checkPosture,
  completionsUrl,
  describeHttpError,
  gatewayPosture,
  isRemoteModelId,
  normaliseBaseUrl,
  parseRemoteModelId,
  remoteModelId,
  requestHeaders,
  ZdrNotConfirmedError,
  type RemoteEndpoint,
} from "./remoteEndpoint";
import {
  catalogBase,
  fetchCatalogContext,
  listRemoteModels,
  parseCatalogModel,
  parseModelEntry,
  parseModelList,
  zdrBlock,
} from "./remoteModels";

const endpoint: RemoteEndpoint = {
  providerId: "experiential-ab12",
  providerName: "Experiential Labs",
  baseUrl: "https://api.experientiallabs.ai/v1",
  apiKey: "xpl_secret0123456789",
  model: "deepseek-v4",
  contextSize: 65536,
  requireZdr: true,
};

const headers = (values: Record<string, string>) => ({
  get: (name: string) => values[name.toLowerCase()] ?? null,
});

describe("remote model ids", () => {
  it("round-trips, keeping a colon inside the model id", () => {
    const id = remoteModelId("exp-1", "llama-4:free");
    expect(id).toBe("remote:exp-1:llama-4:free");
    expect(isRemoteModelId(id)).toBe(true);
    expect(parseRemoteModelId(id)).toEqual({
      providerId: "exp-1",
      model: "llama-4:free",
    });
  });

  it("leaves a library model id alone", () => {
    expect(isRemoteModelId("qwen3-coder-30b")).toBe(false);
    expect(parseRemoteModelId("qwen3-coder-30b")).toBeNull();
  });

  it("rejects an id with no provider or no model", () => {
    expect(parseRemoteModelId("remote:")).toBeNull();
    expect(parseRemoteModelId("remote::model")).toBeNull();
    expect(parseRemoteModelId("remote:provider:")).toBeNull();
  });
});

describe("normaliseBaseUrl", () => {
  it("drops a trailing slash", () => {
    expect(normaliseBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1"
    );
    expect(normaliseBaseUrl(" https://api.example.com ")).toBe(
      "https://api.example.com"
    );
  });

  it("allows plain http only for this computer", () => {
    expect(normaliseBaseUrl("http://127.0.0.1:8000/v1")).toBe(
      "http://127.0.0.1:8000/v1"
    );
    expect(normaliseBaseUrl("http://localhost:8000/v1")).toBe(
      "http://localhost:8000/v1"
    );
    expect(() => normaliseBaseUrl("http://api.example.com/v1")).toThrow(
      /https/
    );
    expect(() => normaliseBaseUrl("http://127.0.0.1.evil.com/v1")).toThrow(
      /https/
    );
  });

  it("refuses a key in the address, a query, or a non-address", () => {
    expect(() => normaliseBaseUrl("https://user:pw@api.example.com")).toThrow(
      /keys and passwords/
    );
    expect(() =>
      normaliseBaseUrl("https://api.example.com/v1?key=abc")
    ).toThrow(/query/);
    expect(() => normaliseBaseUrl("not a url")).toThrow(/valid address/);
    expect(() => normaliseBaseUrl("file:///etc/passwd")).toThrow(/https/);
  });
});

describe("adaptRequestBody", () => {
  const llamaBody = {
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    stream_options: { include_usage: true },
    return_progress: true,
    timings_per_token: true,
    cache_prompt: true,
    temperature: 0.7,
    max_tokens: 512,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    chat_template_kwargs: { enable_thinking: false },
  };

  it("keeps the standard fields, names the model and drops llama-server's own", () => {
    expect(
      adaptRequestBody(llamaBody, { ...endpoint, requireZdr: false })
    ).toEqual({
      model: "deepseek-v4",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.7,
      max_tokens: 512,
      top_p: 0.9,
    });
  });

  it("asks for zero data retention when it is required", () => {
    expect(adaptRequestBody(llamaBody, endpoint).provider).toEqual({
      zdr: true,
    });
  });

  it("does not ask when it is not required", () => {
    expect(
      adaptRequestBody(llamaBody, { ...endpoint, requireZdr: false })
    ).not.toHaveProperty("provider");
  });

  it("leaves out a field the request did not set", () => {
    const adapted = adaptRequestBody({ messages: [] }, endpoint);
    expect(Object.keys(adapted).sort()).toEqual([
      "messages",
      "model",
      "provider",
    ]);
  });
});

describe("requests to the provider", () => {
  it("sends the key as a bearer token, never in the address", () => {
    expect(requestHeaders(endpoint)).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer xpl_secret0123456789",
    });
    expect(completionsUrl(endpoint)).toBe(
      "https://api.experientiallabs.ai/v1/chat/completions"
    );
    expect(completionsUrl(endpoint)).not.toContain("xpl_");
  });
});

describe("gatewayPosture and checkPosture", () => {
  it("reads which provider answered and the zero-retention verdict", () => {
    expect(
      gatewayPosture(
        headers({
          "x-gateway-zdr": "true",
          "x-gateway-provider": "bedrock",
          "x-request-id": "req_1",
        })
      )
    ).toEqual({ provider: "bedrock", zdr: true, requestId: "req_1" });
    expect(gatewayPosture(headers({ "x-gateway-zdr": "FALSE" })).zdr).toBe(
      false
    );
    expect(gatewayPosture(headers({})).zdr).toBeUndefined();
  });

  it("passes a response the provider confirmed", () => {
    const posture = checkPosture(
      endpoint,
      headers({ "x-gateway-zdr": "true" })
    );
    expect(posture.zdr).toBe(true);
  });

  it("refuses a response that was not confirmed, or said otherwise", () => {
    expect(() => checkPosture(endpoint, headers({}))).toThrow(
      ZdrNotConfirmedError
    );
    expect(() =>
      checkPosture(endpoint, headers({ "x-gateway-zdr": "false" }))
    ).toThrow(/keeps data/);
  });

  it("does not hold a provider to it when it is not required", () => {
    expect(() =>
      checkPosture({ ...endpoint, requireZdr: false }, headers({}))
    ).not.toThrow();
  });
});

describe("describeHttpError", () => {
  it("names the cause and keeps the provider's message short", () => {
    expect(
      describeHttpError(
        "Experiential Labs",
        403,
        JSON.stringify({
          error: { code: "needs_subscription", message: "ZDR needs Pro" },
        })
      )
    ).toBe("Experiential Labs refused the request. ZDR needs Pro");
    expect(describeHttpError("X", 401, "")).toBe("X rejected the key.");
    expect(describeHttpError("X", 500, "boom")).toContain("HTTP 500");
    expect(describeHttpError("X", 400, "a".repeat(2000)).length).toBeLessThan(
      400
    );
  });
});

describe("model lists", () => {
  it("reads the context window and the data policy when present", () => {
    expect(
      parseModelEntry({
        id: "m1",
        context_length: 131072,
        data_policy: { zdr: true, zdr_on_request: true, no_training: true },
      })
    ).toEqual({
      id: "m1",
      contextLength: 131072,
      zdr: true,
      zdrOnRequest: true,
      noTraining: true,
    });
    expect(parseModelEntry({ id: "bare" })).toEqual({ id: "bare" });
    expect(parseModelEntry({ nope: 1 })).toBeNull();
    expect(parseModelEntry(null)).toBeNull();
  });

  it("sorts a list and skips what has no id", () => {
    expect(
      parseModelList({ data: [{ id: "b" }, { x: 1 }, { id: "a" }] }).map(
        (m) => m.id
      )
    ).toEqual(["a", "b"]);
    expect(parseModelList({})).toEqual([]);
  });

  it("blocks only a model with no zero-retention route at all", () => {
    expect(zdrBlock("P", { id: "m", zdr: false, zdrOnRequest: false })).toMatch(
      /no zero-retention route for m/
    );
    expect(zdrBlock("P", { id: "m", zdr: false, zdrOnRequest: true })).toBe(
      undefined
    );
    expect(zdrBlock("P", { id: "m", zdr: true })).toBe(undefined);
    expect(zdrBlock("P", { id: "m" })).toBe(undefined);
  });
});

describe("listRemoteModels", () => {
  const provider = {
    name: "Experiential Labs",
    baseUrl: "https://api.experientiallabs.ai/v1",
    apiKey: "xpl_secret0123456789",
  };
  const reply = (status: number, body: string) => async () => ({
    ok: status < 400,
    status,
    text: async () => body,
  });

  it("lists the models and sends the key only as a header", async () => {
    let seen: { url: string; headers?: Record<string, string> } | undefined;
    const result = await listRemoteModels(provider, async (url, init) => {
      seen = { url, headers: init?.headers };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ id: "m1" }] }),
      };
    });
    expect(result).toEqual({ ok: true, models: [{ id: "m1" }] });
    expect(seen?.url).toBe("https://api.experientiallabs.ai/v1/models");
    expect(seen?.headers?.Authorization).toBe("Bearer xpl_secret0123456789");
  });

  it("says when the key is rejected, without repeating it", async () => {
    const result = await listRemoteModels(provider, reply(401, "{}"));
    expect(result.ok).toBe(false);
    expect(result.error).toContain("rejected the key");
    expect(result.error).not.toContain("xpl_");
  });

  it("says when the address does not answer with a model list", async () => {
    const result = await listRemoteModels(provider, reply(200, "<html>"));
    expect(result.error).toContain("did not answer with a model list");
  });

  it("says when the provider cannot be reached, or is too slow", async () => {
    const unreachable = await listRemoteModels(provider, async () => {
      throw new TypeError("fetch failed: xpl_secret0123456789");
    });
    expect(unreachable.error).toBe("Experiential Labs could not be reached.");

    const slow = await listRemoteModels(provider, async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    expect(slow.error).toBe("Experiential Labs did not answer in time.");
  });
});

describe("a model's real window", () => {
  // deepseek-v4.1-flash-1017 in Experiential's public catalog (2026-10-26)
  const catalogEntry = {
    model: {
      slug: "deepseek-v4.1-flash-1017",
      context_window: 1048576,
      max_input_tokens: 655360,
      max_output_tokens: 393216,
    },
  };

  it("takes what the provider accepts as input over the total window", () => {
    expect(parseCatalogModel(catalogEntry)).toEqual({
      contextWindow: 1048576,
      maxInputTokens: 655360,
      maxOutputTokens: 393216,
      usable: 655360,
    });
  });

  it("falls back to the window when no input limit is given", () => {
    expect(
      parseCatalogModel({ model: { context_window: 200000 } })?.usable
    ).toBe(200000);
  });

  it("says nothing for a model whose limits are unknown", () => {
    expect(parseCatalogModel({ model: { context_window: null } })).toBe(
      undefined
    );
    expect(parseCatalogModel({})).toBe(undefined);
    expect(parseCatalogModel(null)).toBe(undefined);
  });

  it("prefers the input limit in a model list too", () => {
    expect(
      parseModelEntry({
        id: "m",
        context_window: 1048576,
        max_input_tokens: 655360,
      })?.contextLength
    ).toBe(655360);
  });

  it("has a public catalog only for a provider that publishes one", () => {
    expect(
      catalogBase({
        presetId: "experiential",
        baseUrl: "https://api.experientiallabs.ai/v1",
      })
    ).toBe("https://api.experientiallabs.ai");
    expect(
      catalogBase({ presetId: "custom", baseUrl: "https://api.example.com/v1" })
    ).toBeUndefined();
  });

  it("asks the catalog for one model, without the key", async () => {
    let asked: { url: string; init?: unknown } | undefined;
    const context = await fetchCatalogContext(
      "https://api.experientiallabs.ai",
      "deepseek-v4.1-flash-1017",
      async (url, init) => {
        asked = { url, init };
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(catalogEntry),
        };
      }
    );
    expect(context?.usable).toBe(655360);
    expect(asked?.url).toBe(
      "https://api.experientiallabs.ai/api/models/deepseek-v4.1-flash-1017"
    );
    expect(JSON.stringify(asked?.init)).not.toContain("Authorization");
  });

  it("is undefined when the catalog is down, does not know the model, or answers badly", async () => {
    const reply = (ok: boolean, text: string) => async () => ({
      ok,
      status: ok ? 200 : 404,
      text: async () => text,
    });
    expect(
      await fetchCatalogContext("https://x", "m", reply(false, "{}"))
    ).toBe(undefined);
    expect(
      await fetchCatalogContext("https://x", "m", reply(true, "<html>"))
    ).toBe(undefined);
    expect(
      await fetchCatalogContext("https://x", "m", async () => {
        throw new Error("offline");
      })
    ).toBe(undefined);
  });
});
