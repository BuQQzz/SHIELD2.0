import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCloudStore } from "./cloud-store";
import type { ProviderSummary } from "@/types/providers";

const provider = (id: string, hasKey = true): ProviderSummary => ({
  id,
  name: `Provider ${id}`,
  presetId: "experiential",
  baseUrl: "https://api.experientiallabs.ai/v1",
  requireZdr: true,
  defaultContext: 32768,
  acknowledgedAt: "2026-10-26T20:00:00.000Z",
  hasKey,
  keyHint: "3456",
});

function stubProviders(
  providers: ProviderSummary[],
  models = vi.fn(async (id: string) =>
    id === "bad"
      ? { ok: false as const, error: "Provider bad rejected the key." }
      : { ok: true as const, models: [{ id: `${id}-model` }] }
  )
) {
  Object.assign(window, {
    providers: {
      list: vi.fn(async () => ({
        success: true,
        providers,
        encryptionAvailable: true,
      })),
      models,
      allowModel: vi.fn(async () => ({ success: true })),
    },
  });
  return models;
}

describe("cloud store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCloudStore.setState({
      providers: [],
      loaded: false,
      fetched: {},
      fetching: false,
      fetchedAt: 0,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the providers without asking any of them for models", async () => {
    const models = stubProviders([provider("a")]);
    await useCloudStore.getState().loadProviders();
    expect(useCloudStore.getState().providers).toHaveLength(1);
    expect(useCloudStore.getState().loaded).toBe(true);
    expect(models).not.toHaveBeenCalled();
  });

  it("asks only providers with a key, and keeps a failure as an error", async () => {
    const models = stubProviders([
      provider("a"),
      provider("bad"),
      provider("nokey", false),
    ]);
    await useCloudStore.getState().loadProviders();
    await useCloudStore.getState().fetchModels();

    expect(models).toHaveBeenCalledTimes(2);
    const { fetched } = useCloudStore.getState();
    expect(fetched.a).toEqual({ models: [{ id: "a-model" }] });
    expect(fetched.bad).toEqual({
      models: [],
      error: "Provider bad rejected the key.",
    });
    expect(fetched.nokey).toBeUndefined();
  });

  it("does not ask again within a minute, unless forced", async () => {
    const models = stubProviders([provider("a")]);
    await useCloudStore.getState().loadProviders();
    await useCloudStore.getState().fetchModels();
    await useCloudStore.getState().fetchModels();
    expect(models).toHaveBeenCalledTimes(1);

    await useCloudStore.getState().fetchModels(true);
    expect(models).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(61_000);
    await useCloudStore.getState().fetchModels();
    expect(models).toHaveBeenCalledTimes(3);
  });

  it("asks at once for a provider that was added since", async () => {
    const models = stubProviders([provider("a")]);
    await useCloudStore.getState().loadProviders();
    await useCloudStore.getState().fetchModels();

    stubProviders([provider("a"), provider("b")], models);
    await useCloudStore.getState().loadProviders();
    await useCloudStore.getState().fetchModels();
    expect(models).toHaveBeenCalledWith("b");
  });

  it("forgets the models of a provider that was removed", async () => {
    stubProviders([provider("a"), provider("b")]);
    await useCloudStore.getState().loadProviders();
    await useCloudStore.getState().fetchModels();
    expect(Object.keys(useCloudStore.getState().fetched).sort()).toEqual([
      "a",
      "b",
    ]);

    stubProviders([provider("a")]);
    await useCloudStore.getState().loadProviders();
    expect(Object.keys(useCloudStore.getState().fetched)).toEqual(["a"]);
  });

  it("allows one model without zero retention, then reloads the providers", async () => {
    stubProviders([provider("a")]);
    await useCloudStore.getState().loadProviders();

    await useCloudStore.getState().allowModel("a", "claude-x", true);

    const allow = window.providers.allowModel as unknown as ReturnType<
      typeof vi.fn
    >;
    expect(allow).toHaveBeenCalledWith("a", "claude-x", true);
  });
});
