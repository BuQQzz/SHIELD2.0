/**
 * Talking to a remote OpenAI-compatible provider (main process only)
 *
 * LlamaServerProvider keeps the chat, the summaries and the stall handling,
 * and sends its requests to llama-server in that server's own dialect. For a
 * remote provider it attaches to one of these endpoints instead: the same
 * requests, cut down to the standard fields, with the key, the model, and -
 * when the user requires it - a demand for zero data retention that the
 * response is checked against.
 */

import type { ProviderConfig } from "../../types/providers.js";

/** Model ids of remote models: `remote:<provider id>:<the provider's model id>` */
const REMOTE_PREFIX = "remote:";

/** What a chat session needs to reach a remote model */
export interface RemoteEndpoint {
  providerId: string;
  providerName: string;
  /** Without a trailing slash, e.g. https://api.example.com/v1 */
  baseUrl: string;
  apiKey: string;
  /** Sent as `model` */
  model: string;
  /** Context window the chat is managed against */
  contextSize: number;
  /**
   * Zero data retention is required: the request asks for it, and the reply
   * is thrown away unless the provider says it was served that way.
   */
  requireZdr: boolean;
}

/** Finds a saved provider and its key; the ProviderStore in the main process */
export interface RemoteProviderSource {
  resolve(
    providerId: string
  ): { config: ProviderConfig; apiKey: string } | undefined;
}

export function remoteModelId(providerId: string, model: string): string {
  return `${REMOTE_PREFIX}${providerId}:${model}`;
}

export function isRemoteModelId(id: string | undefined): boolean {
  return !!id && id.startsWith(REMOTE_PREFIX);
}

/** The provider and model a remote model id names, or null */
export function parseRemoteModelId(
  id: string
): { providerId: string; model: string } | null {
  if (!isRemoteModelId(id)) return null;
  const rest = id.slice(REMOTE_PREFIX.length);
  const split = rest.indexOf(":");
  // A model id may hold colons ("name:free"); a provider id never does
  if (split <= 0 || split === rest.length - 1) return null;
  return { providerId: rest.slice(0, split), model: rest.slice(split + 1) };
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host === "::1"
  );
}

/**
 * The address a provider is reached at, checked: https (plain http only for
 * a server on this computer, such as a self-hosted gateway), no credentials
 * in the address, no query. Without a trailing slash.
 */
export function normaliseBaseUrl(input: string): string {
  const trimmed = input.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("That is not a valid address.");
  }
  if (url.username || url.password) {
    throw new Error("Keep keys and passwords out of the address.");
  }
  if (url.search || url.hash) {
    throw new Error("The address should have no query or fragment.");
  }
  const local = isLoopbackHost(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(
      "Use an https address. Plain http is only allowed for a server on this computer."
    );
  }
  return url.toString().replace(/\/+$/, "");
}

/**
 * The fields a standard chat completions API accepts. llama-server's own
 * extras (cache_prompt, top_k, repeat_penalty, return_progress,
 * timings_per_token, chat_template_kwargs) are left out: a hosted gateway
 * may refuse a body with fields it does not know.
 */
const STANDARD_FIELDS = [
  "messages",
  "stream",
  "stream_options",
  "temperature",
  "max_tokens",
  "top_p",
] as const;

/** A request written for llama-server, as one a hosted provider takes */
export function adaptRequestBody(
  body: Record<string, unknown>,
  endpoint: RemoteEndpoint
): Record<string, unknown> {
  const adapted: Record<string, unknown> = { model: endpoint.model };
  for (const field of STANDARD_FIELDS) {
    if (body[field] !== undefined) adapted[field] = body[field];
  }
  // The OpenRouter-compatible field the gateway reads: serve this request
  // only through providers that keep no copy of it
  if (endpoint.requireZdr) adapted.provider = { zdr: true };
  return adapted;
}

export function requestHeaders(
  endpoint: RemoteEndpoint
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${endpoint.apiKey}`,
  };
}

export function completionsUrl(endpoint: RemoteEndpoint): string {
  return `${endpoint.baseUrl}/chat/completions`;
}

/** What a gateway's response headers say about how the request was served */
export interface GatewayPosture {
  /** The provider that answered, e.g. "bedrock" */
  provider?: string;
  /** The gateway's own verdict: that route keeps no copy of the request */
  zdr?: boolean;
  requestId?: string;
}

export function gatewayPosture(headers: {
  get(name: string): string | null;
}): GatewayPosture {
  const zdr = headers.get("x-gateway-zdr")?.trim().toLowerCase();
  return {
    provider: headers.get("x-gateway-provider") ?? undefined,
    zdr: zdr === "true" ? true : zdr === "false" ? false : undefined,
    requestId: headers.get("x-request-id") ?? undefined,
  };
}

/**
 * Thrown when zero data retention is required and the provider did not say
 * the request was served that way. The reply is not read or kept.
 */
export class ZdrNotConfirmedError extends Error {
  constructor(
    readonly providerName: string,
    readonly posture: GatewayPosture
  ) {
    super(
      `${providerName} did not confirm zero data retention for this request` +
        ` (it reported ${posture.zdr === false ? "that the route keeps data" : "nothing"}). ` +
        `The reply was thrown away. Turn off "Require zero data retention" in Settings > Providers to use this model anyway.`
    );
    this.name = "ZdrNotConfirmedError";
  }
}

/** Throws unless a required zero-retention route served the response */
export function checkPosture(
  endpoint: RemoteEndpoint,
  headers: { get(name: string): string | null }
): GatewayPosture {
  const posture = gatewayPosture(headers);
  if (endpoint.requireZdr && posture.zdr !== true) {
    throw new ZdrNotConfirmedError(endpoint.providerName, posture);
  }
  return posture;
}

/**
 * A failed request as a sentence for the user. The provider's own message is
 * kept short; the key is never part of it.
 */
export function describeHttpError(
  providerName: string,
  status: number,
  body: string
): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: string } | string;
    };
    detail =
      typeof parsed.error === "string"
        ? parsed.error
        : (parsed.error?.message ?? "");
  } catch {
    detail = body;
  }
  detail = detail.replace(/\s+/g, " ").trim().slice(0, 300);

  const lead =
    status === 401
      ? `${providerName} rejected the key.`
      : status === 403
        ? `${providerName} refused the request.`
        : status === 404
          ? `${providerName} does not know that model or address.`
          : status === 429
            ? `${providerName} is rate limiting this key.`
            : status >= 500
              ? `${providerName} had a problem (HTTP ${status}).`
              : `${providerName} answered HTTP ${status}.`;
  return detail ? `${lead} ${detail}` : lead;
}
