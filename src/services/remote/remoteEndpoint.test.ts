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
