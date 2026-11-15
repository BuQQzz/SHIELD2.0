import { describe, expect, it } from "vitest";
import {
  costTitle,
  formatCost,
  parseCatalogPricing,
  requestCost,
} from "./cost";
import { parseCatalogModel } from "./remoteModels";

/** deepseek-v4.1-flash in Experiential's catalog (2026-11-15), trimmed */
const catalogEntry = {
  model: {
    slug: "deepseek-v4.1-flash",
    context_window: 1048576,
    max_input_tokens: 655360,
  },
  providers: [
    {
      provider: "experiential_cloud",
      input_nano_usd_per_million: 300000000,
      cached_input_nano_usd_per_million: 6000000,
      output_nano_usd_per_million: 1200000000,
      reasoning_nano_usd_per_million: 1200000000,
    },
  ],
};

describe("parseCatalogPricing", () => {
  it("reads a route's prices in dollars per million tokens", () => {
    expect(parseCatalogPricing(catalogEntry)).toEqual({
      input: 0.3,
      cachedInput: 0.006,
      output: 1.2,
      reasoning: 1.2,
    });
  });

  it("skips a route without prices, and gives none when no route has them", () => {
    expect(
      parseCatalogPricing({
        providers: [{ provider: "x" }, ...catalogEntry.providers],
      })?.input
    ).toBe(0.3);
    expect(parseCatalogPricing({ providers: [{ provider: "x" }] })).toBe(
      undefined
    );
    expect(parseCatalogPricing({})).toBe(undefined);
  });

  it("comes with the model's context from the catalog", () => {
    expect(parseCatalogModel(catalogEntry)?.pricing?.output).toBe(1.2);
  });
});

describe("requestCost", () => {
  const pricing = { input: 0.3, cachedInput: 0.006, output: 1.2 };

  it("prices fresh and cached input apart, and the reply", () => {
    const cost = requestCost(
      {
        prompt_tokens: 100_000,
        prompt_tokens_details: { cached_tokens: 90_000 },
        completion_tokens: 1_000,
      },
      pricing
    );
    // 10K fresh at 0.30, 90K cached at 0.006, 1K out at 1.20 (per million)
    expect(cost?.charged).toBeCloseTo(0.003 + 0.00054 + 0.0012, 10);
    expect(cost?.listed).toBe(cost?.charged);
  });

  it("takes the provider's own charge, and keeps the listed price beside it", () => {
    // A daily allowance: the gateway charged nothing
    const covered = requestCost(
      { prompt_tokens: 1_000_000, completion_tokens: 0, cost: 0 },
      pricing
    );
    expect(covered?.charged).toBe(0);
    expect(covered?.listed).toBeCloseTo(0.3, 10);
    expect(requestCost({ cost: 0.01 }, undefined)).toEqual({ charged: 0.01 });
  });

  it("knows nothing without usage or prices", () => {
    expect(requestCost(undefined, pricing)).toBe(undefined);
    expect(requestCost({ prompt_tokens: 5 }, undefined)).toBe(undefined);
  });
});

describe("formatCost", () => {
  it("shows cents to two places and less to four", () => {
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(0.00001)).toBe("<$0.0001");
    expect(formatCost(0)).toBe("$0.00");
  });
});

describe("costTitle", () => {
  it("names the listed price only when the charge differs", () => {
    expect(costTitle("This chat", 0.02, 0.02)).toBe(
      "This chat cost $0.02 at the provider's prices"
    );
    expect(costTitle("This chat", 0, 0.0042)).toBe(
      "This chat cost $0.00 as the provider charged it; $0.0042 at its listed prices"
    );
  });
});
