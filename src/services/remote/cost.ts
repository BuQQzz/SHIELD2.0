/**
 * What a hosted model's requests cost, as OpenCode shows it: the tokens of
 * each request, priced from the provider's catalog, summed over the chat.
 *
 * Prices are in US dollars per million tokens. Experiential's public
 * catalog gives them per route in nano-dollars per million
 * (`input_nano_usd_per_million`, ...). A provider that reports a request's
 * cost itself (`usage.cost`, as OpenRouter-style gateways do) is believed.
 */

/** US dollars per million tokens */
export interface ModelPricing {
  input: number;
  /** Input read from the provider's prompt cache */
  cachedInput?: number;
  output: number;
  /** Thinking tokens, when the provider prices them apart from output */
  reasoning?: number;
}

/** The usage block of an OpenAI-compatible reply */
export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number } | null;
  completion_tokens_details?: { reasoning_tokens?: number } | null;
  /** What the provider charged, in US dollars, when it says */
  cost?: number;
}

const NANO_PER_DOLLAR = 1e9;

const price = (value: unknown): number | undefined =>
  typeof value === "number" && value >= 0 ? value / NANO_PER_DOLLAR : undefined;

/**
 * A model's prices from its catalog entry (`{ providers: [...] }`): the
 * first route that gives input and output prices. undefined when none does.
 */
export function parseCatalogPricing(body: unknown): ModelPricing | undefined {
  const routes = (body as { providers?: unknown } | null)?.providers;
  if (!Array.isArray(routes)) return undefined;
  for (const route of routes) {
    if (!route || typeof route !== "object") continue;
    const entry = route as Record<string, unknown>;
    const input = price(entry.input_nano_usd_per_million);
    const output = price(entry.output_nano_usd_per_million);
    if (input === undefined || output === undefined) continue;
    return {
      input,
      output,
      cachedInput: price(entry.cached_input_nano_usd_per_million),
      reasoning: price(entry.reasoning_nano_usd_per_million),
    };
  }
  return undefined;
}

const count = (value: unknown): number =>
  typeof value === "number" && value > 0 ? value : 0;

/** One request's cost in US dollars */
export interface RequestCost {
  /**
   * What the provider charged: its own figure (`usage.cost`), else the
   * listed price. 0 when a plan or allowance covered it: Experiential
   * reported 0 for deepseek-v4.1-flash on a daily allowance (2026-11-15).
   */
  charged: number;
  /** The tokens at the provider's listed prices, when it lists them */
  listed?: number;
}

/**
 * One request's cost: what the provider says it charged, and the tokens at
 * its listed prices. Cached input is priced as such, and thinking (counted
 * inside the completion tokens) at its own price when it has one. undefined
 * when there is neither a figure nor a price.
 */
export function requestCost(
  usage: Usage | undefined,
  pricing: ModelPricing | undefined
): RequestCost | undefined {
  if (!usage) return undefined;
  const reported =
    typeof usage.cost === "number" && usage.cost >= 0 ? usage.cost : undefined;
  const listed = pricing ? listedCost(usage, pricing) : undefined;
  const charged = reported ?? listed;
  if (charged === undefined) return undefined;
  return { charged, ...(listed !== undefined ? { listed } : {}) };
}

function listedCost(usage: Usage, pricing: ModelPricing): number {
  const prompt = count(usage.prompt_tokens);
  const cached = Math.min(
    count(usage.prompt_tokens_details?.cached_tokens),
    prompt
  );
  const completion = count(usage.completion_tokens);
  const reasoning = Math.min(
    count(usage.completion_tokens_details?.reasoning_tokens),
    completion
  );
  return (
    ((prompt - cached) * pricing.input +
      cached * (pricing.cachedInput ?? pricing.input) +
      (completion - reasoning) * pricing.output +
      reasoning * (pricing.reasoning ?? pricing.output)) /
    1e6
  );
}

/** The tooltip for a cost: the listed price too, when the charge differs */
export function costTitle(
  what: string,
  charged: number,
  listed: number | undefined
): string {
  const base = `${what} cost ${formatCost(charged)}`;
  if (listed === undefined || Math.abs(listed - charged) < 1e-9) {
    return `${base} at the provider's prices`;
  }
  return `${base} as the provider charged it; ${formatCost(listed)} at its listed prices`;
}

/** A cost as the chat shows it: cents to two places, less to four */
export function formatCost(usd: number): string {
  if (usd <= 0) return "$0.00";
  if (usd < 0.0001) return "<$0.0001";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
