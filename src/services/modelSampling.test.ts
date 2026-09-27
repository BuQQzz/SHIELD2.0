import { describe, expect, it } from "vitest";
import {
  describeSampling,
  effectiveSampling,
  samplingFromGguf,
} from "./modelSampling";

const user = { temperature: 0.21, topK: 50, topP: 0.95, repeatPenalty: 1.1 };

describe("samplingFromGguf", () => {
  it("reads Gemma 4's general.sampling, tidying float32 values", () => {
    // As node-llama-cpp returns it for gemma-4-12B-it-Q4_K_M.gguf
    expect(
      samplingFromGguf({ top_k: 64, top_p: 0.949999988079071, temp: 1 })
    ).toEqual({
      source: "model",
      temperature: 1,
      topK: 64,
      topP: 0.95,
      repeatPenalty: undefined,
    });
  });

  it("reads a repeat penalty when the file gives one", () => {
    expect(samplingFromGguf({ penalty_repeat: 1.0499999523162842 })).toEqual(
      expect.objectContaining({ repeatPenalty: 1.05 })
    );
  });

  it("returns nothing for a file without sampling", () => {
    expect(samplingFromGguf(undefined)).toBeNull();
    expect(samplingFromGguf({ sequence: "edkypmxt" })).toBeNull();
    expect(samplingFromGguf({ temp: "hot" })).toBeNull();
  });
});

describe("effectiveSampling", () => {
  it("keeps the user's values when the model recommends none", () => {
    expect(effectiveSampling(user, null)).toEqual(user);
  });

  it("uses the model's values and drops the repeat penalty it leaves out", () => {
    expect(
      effectiveSampling(user, {
        source: "model",
        temperature: 1,
        topK: 64,
        topP: 0.95,
      })
    ).toEqual({ temperature: 1, topK: 64, topP: 0.95, repeatPenalty: 1 });
  });

  it("fills a partial recommendation from the user's values", () => {
    expect(
      effectiveSampling(user, { source: "catalog", temperature: 0.7 })
    ).toEqual({ temperature: 0.7, topK: 50, topP: 0.95, repeatPenalty: 1 });
  });
});

describe("effectiveSampling with tools", () => {
  const gemma = {
    source: "model" as const,
    temperature: 1,
    topK: 64,
    topP: 0.95,
  };

  it("caps the model's temperature while tools are available", () => {
    expect(
      effectiveSampling(user, gemma, { toolsAvailable: true }).temperature
    ).toBe(0.5);
    expect(effectiveSampling(user, gemma).temperature).toBe(1);
  });

  it("leaves a lower recommended temperature alone", () => {
    expect(
      effectiveSampling(
        user,
        { source: "catalog", temperature: 0.3 },
        { toolsAvailable: true }
      ).temperature
    ).toBe(0.3);
  });

  it("never caps the user's own temperature", () => {
    expect(
      effectiveSampling({ ...user, temperature: 0.9 }, null, {
        toolsAvailable: true,
      }).temperature
    ).toBe(0.9);
  });
});

describe("describeSampling", () => {
  it("says no repeat penalty rather than 1", () => {
    expect(
      describeSampling({
        temperature: 1,
        topK: 64,
        topP: 0.95,
        repeatPenalty: 1,
      })
    ).toBe("temperature 1 · top-k 64 · top-p 0.95 · no repeat penalty");
  });
});
