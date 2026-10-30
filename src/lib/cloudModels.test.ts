import { describe, expect, it } from "vitest";
import { cloudLine, cloudModelOptions } from "./cloudModels";
import { canHostAgents, isRuntimeAvailable } from "@/config/models";
import { teamAvailability } from "@/agents/teamFit";
import { isCodingModel } from "./sessions";
import {
  detectModelFamily,
  usesNativeToolCalling,
} from "@/config/systemPrompts";
import type { ProviderSummary } from "@/types/providers";

const provider = (
  overrides: Partial<ProviderSummary> = {}
): ProviderSummary => ({
  id: "exp-1",
  name: "Experiential Labs",
  presetId: "experiential",
  baseUrl: "https://api.experientiallabs.ai/v1",
  requireZdr: true,
  defaultContext: 32768,
  acknowledgedAt: "2026-10-26T20:00:00.000Z",
  hasKey: true,
  keyHint: "3456",
  ...overrides,
});

describe("cloudModelOptions", () => {
  it("lists a provider's models as hosted options", () => {
    const options = cloudModelOptions([provider()], {
      "exp-1": {
        models: [
          { id: "deepseek-v4", contextLength: 131072, zdr: true },
          { id: "llama-4" },
        ],
      },
    });
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      id: "remote:exp-1:deepseek-v4",
      name: "remote:exp-1:deepseek-v4",
      displayName: "deepseek-v4",
      runtime: "remote",
      contextSize: 131072,
      size: "Experiential Labs · zero retention",
      cloud: { providerId: "exp-1", zdrRequired: true, zdr: true },
    });
    // No window reported: the provider's default
    expect(options[1]?.contextSize).toBe(32768);
  });

  it("marks a model with no zero-retention route when that is required", () => {
    const [option] = cloudModelOptions([provider()], {
      "exp-1": {
        models: [{ id: "claude-x", zdr: false, zdrOnRequest: false }],
      },
    });
    expect(option?.cloud?.blocked).toMatch(/No zero-retention route/);
    expect(option?.size).toContain("no zero-retention route");
  });

  it("does not block it when zero retention is not required", () => {
    const [option] = cloudModelOptions([provider({ requireZdr: false })], {
      "exp-1": { models: [{ id: "claude-x", zdr: false }] },
    });
    expect(option?.cloud?.blocked).toBeUndefined();
    expect(option?.size).toBe("Experiential Labs · cloud");
  });

  it("lets one model through once the user allowed it without a route", () => {
    const [option] = cloudModelOptions(
      [provider({ allowNoZdr: ["claude-x"] })],
      {
        "exp-1": {
          models: [{ id: "claude-x", zdr: false, zdrOnRequest: false }],
        },
      }
    );
    expect(option?.cloud).toMatchObject({
      noZdrRoute: true,
      zdrAllowed: true,
      zdrRequired: true,
    });
    expect(option?.cloud?.blocked).toBeUndefined();
    expect(option?.size).toBe(
      "Experiential Labs · no zero retention (you allowed it)"
    );
  });

  it("still marks the other models of the same provider", () => {
    const options = cloudModelOptions(
      [provider({ allowNoZdr: ["claude-x"] })],
      {
        "exp-1": {
          models: [
            { id: "claude-x", zdr: false, zdrOnRequest: false },
            { id: "llama-4", zdr: false, zdrOnRequest: false },
          ],
        },
      }
    );
    expect(options[0]?.cloud?.blocked).toBeUndefined();
    expect(options[1]?.cloud).toMatchObject({
      noZdrRoute: true,
      zdrAllowed: false,
    });
    expect(options[1]?.cloud?.blocked).toMatch(/No zero-retention route/);
  });

  it("offers no choice for a model that keeps data on request", () => {
    const [option] = cloudModelOptions([provider()], {
      "exp-1": { models: [{ id: "gpt-x", zdr: false, zdrOnRequest: true }] },
    });
    expect(option?.cloud).toMatchObject({
      noZdrRoute: false,
      zdrAllowed: false,
    });
    expect(option?.cloud?.blocked).toBeUndefined();
  });

  it("skips a provider with no key, and one whose list has not been read", () => {
    expect(
      cloudModelOptions([provider({ hasKey: false })], {
        "exp-1": { models: [{ id: "m" }] },
      })
    ).toEqual([]);
    expect(cloudModelOptions([provider()], {})).toEqual([]);
  });

  it("lists the loaded hosted model even before its provider's list is read", () => {
    const options = cloudModelOptions(
      [provider()],
      {},
      {
        id: "remote:exp-1:deepseek-v4",
        contextSize: 65536,
      }
    );
    expect(options.map((o) => o.id)).toEqual(["remote:exp-1:deepseek-v4"]);
    expect(options[0]?.contextSize).toBe(65536);

    // Not twice once the list is read
    const again = cloudModelOptions(
      [provider()],
      { "exp-1": { models: [{ id: "deepseek-v4" }] } },
      { id: "remote:exp-1:deepseek-v4" }
    );
    expect(again).toHaveLength(1);
  });

  it("ignores a loaded model of a provider that was removed", () => {
    expect(cloudModelOptions([], {}, { id: "remote:gone:model" })).toEqual([]);
  });
});

describe("cloudLine", () => {
  it("is empty for a local model", () => {
    expect(cloudLine({})).toBe("");
  });
});

describe("a hosted model among the app's rules", () => {
  const [option] = cloudModelOptions([provider()], {
    "exp-1": { models: [{ id: "gemma-4-qwen-llama" }] },
  });

  it("can be loaded and can host a team, untested", () => {
    expect(isRuntimeAvailable(option!)).toBe(true);
    expect(canHostAgents("remote")).toBe(true);
    expect(canHostAgents("node-llama-cpp")).toBe(false);
    expect(teamAvailability(option)).toMatchObject({
      state: "available",
      untested: true,
    });
  });

  it("is never nudged toward a local coding model", () => {
    expect(isCodingModel(option?.id)).toBe(true);
  });

  it("gets the generic prompt, whatever the model is called", () => {
    expect(detectModelFamily(option!.name)).toBe("generic");
    expect(usesNativeToolCalling(option!.name)).toBe(false);
    expect(detectModelFamily("Qwen3 Coder 30B")).toBe("qwen");
  });
});
