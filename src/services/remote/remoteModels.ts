/**
 * The models a remote provider offers (main process only)
 *
 * `GET <base>/models` is the standard way to list them, and doubles as the
 * check that a key works. A gateway may add detail to each entry - the
 * context window, and what it keeps of a request - which is read when there.
 */

import type {
  ProviderPresetId,
  ProviderTestResult,
  RemoteModel,
} from "../../types/providers.js";
import { describeHttpError } from "./remoteEndpoint.js";

type Fetch = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

/**
 * Names a provider may report the context window under. What the provider
 * accepts as input comes first: a total window often counts the longest
 * possible reply inside it, so a chat managed against that figure would be
 * refused before it ever made room.
 */
const CONTEXT_FIELDS = [
  "max_input_tokens",
  "context_length",
  "context_window",
  "max_context_length",
  "max_model_len",
] as const;

function readContextLength(entry: Record<string, unknown>): number | undefined {
  for (const field of CONTEXT_FIELDS) {
    const value = entry[field];
    if (typeof value === "number" && value > 0) return Math.floor(value);
  }
  return undefined;
}

/** One entry of a model list; null when it has no id */
export function parseModelEntry(entry: unknown): RemoteModel | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;

  const model: RemoteModel = { id: record.id };
  const contextLength = readContextLength(record);
  if (contextLength) model.contextLength = contextLength;

  const policy = record.data_policy;
  if (policy && typeof policy === "object") {
    const { zdr, zdr_on_request, no_training } = policy as Record<
      string,
      unknown
    >;
    if (typeof zdr === "boolean") model.zdr = zdr;
    if (typeof zdr_on_request === "boolean")
      model.zdrOnRequest = zdr_on_request;
    if (typeof no_training === "boolean") model.noTraining = no_training;
  }
  return model;
}

export function parseModelList(body: unknown): RemoteModel[] {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map(parseModelEntry)
    .filter((model): model is RemoteModel => model !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** What a provider's public catalog says of one model's window */
export interface CatalogContext {
  /** The total window, as the maker states it */
  contextWindow?: number;
  /** The most the provider accepts as input */
  maxInputTokens?: number;
  maxOutputTokens?: number;
  /**
   * What the chat is managed against: the input limit, else the window. A
   * window that counts the reply inside it is not what can be sent.
   */
  usable: number;
}

const positive = (value: unknown): number | undefined =>
  typeof value === "number" && value > 0 ? Math.floor(value) : undefined;

/** One model's entry in a provider's catalog (`{ model: { ... } }`) */
export function parseCatalogModel(body: unknown): CatalogContext | undefined {
  const model = (body as { model?: unknown } | null)?.model;
  if (!model || typeof model !== "object") return undefined;
  const entry = model as Record<string, unknown>;
  const contextWindow = positive(entry.context_window);
  const maxInputTokens = positive(entry.max_input_tokens);
  const usable = maxInputTokens ?? contextWindow;
  if (!usable) return undefined;
  return {
    contextWindow,
    maxInputTokens,
    maxOutputTokens: positive(entry.max_output_tokens),
    usable,
  };
}

/**
 * Where a provider publishes a catalog of its models and their limits, for
 * a provider that does: Experiential's is public, at its API's host. The
 * list a key gives (`/models`) names what the key may call, not how large
 * each model's window is.
 */
export function catalogBase(provider: {
  presetId: ProviderPresetId;
  baseUrl: string;
}): string | undefined {
  if (provider.presetId !== "experiential") return undefined;
  try {
    return new URL(provider.baseUrl).origin;
  } catch {
    return undefined;
  }
}

/**
 * A model's real window from the provider's catalog. The catalog is public,
 * so the request carries no key. Never throws: undefined when it cannot say.
 */
export async function fetchCatalogContext(
  base: string,
  slug: string,
  fetchImpl: Fetch = fetch as unknown as Fetch
): Promise<CatalogContext | undefined> {
  try {
    const response = await fetchImpl(
      `${base}/api/models/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!response.ok) return undefined;
    return parseCatalogModel(JSON.parse(await response.text()));
  } catch {
    return undefined;
  }
}

/**
 * Why a model cannot be used when zero data retention is required, from what
 * its provider says of it; undefined when it can, or when the provider says
 * nothing (the reply is still checked, request by request).
 */
export function zdrBlock(
  providerName: string,
  model: RemoteModel
): string | undefined {
  if (model.zdr === false && model.zdrOnRequest !== true) {
    return (
      `${providerName} has no zero-retention route for ${model.id}. ` +
      `Pick another model, or turn off "Require zero data retention" in Settings > Providers.`
    );
  }
  return undefined;
}

/**
 * List a provider's models with its key. Never throws: a failure comes back
 * as a sentence in `error`, without the key in it.
 */
export async function listRemoteModels(
  provider: { name: string; baseUrl: string; apiKey: string },
  fetchImpl: Fetch = fetch as unknown as Fetch
): Promise<ProviderTestResult> {
  try {
    const response = await fetchImpl(`${provider.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        error: describeHttpError(provider.name, response.status, text),
      };
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return {
        ok: false,
        error: `${provider.name} did not answer with a model list. Check the address.`,
      };
    }
    return { ok: true, models: parseModelList(body) };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "did not answer in time"
        : "could not be reached";
    return { ok: false, error: `${provider.name} ${reason}.` };
  }
}
