import { describe, it, expect } from "vitest";
import {
  MODEL_CATALOG,
  MODEL_FAMILIES,
  DEFAULT_MODEL_ID,
  getModelById,
  getModelFit,
  getRecommendedVariant,
  isRuntimeAvailable,
  matchesModelFile,
  pickModelFile,
  type ModelFile,
} from "./models";

const file = (overrides: Partial<ModelFile> = {}): ModelFile => ({
  name: "Model-Q4_K_M.gguf",
  hfRepo: "owner/Model-GGUF",
  sizeBytes: 1,
  minVRAM: 0,
  ...overrides,
});

describe("the library", () => {
  it("has three families: Qwen, Gemma and Bonsai", () => {
    expect(MODEL_FAMILIES.map((f) => f.id)).toEqual([
      "qwen",
      "gemma",
      "bonsai",
    ]);
  });

  it("has unique variant ids, each tied to its family", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const family of MODEL_FAMILIES) {
      for (const variant of family.variants) {
        expect(variant.familyId).toBe(family.id);
      }
    }
  });

  it("downloads exact files, never machine-specific paths", () => {
    for (const model of MODEL_CATALOG) {
      expect(model.uri).toMatch(/^hf:[^/]+\/[^/]+\/.+\.gguf$/);
      for (const f of model.files) expect(f.name).toMatch(/\.gguf$/);
    }
  });

  it("defaults to a model SHIELD can run", () => {
    const model = getModelById(DEFAULT_MODEL_ID);
    expect(model).toBeDefined();
    expect(isRuntimeAvailable(model!)).toBe(true);
  });

  it("marks Bonsai as needing a runtime SHIELD does not have yet", () => {
    expect(isRuntimeAvailable(getModelById("bonsai-2-27b")!)).toBe(false);
  });
});

describe("matchesModelFile", () => {
  const target = file({ name: "gemma-4-12b-it-Q4_K_M.gguf" });

  it("matches the repo's file name, ignoring case", () => {
    expect(matchesModelFile("gemma-4-12b-it-Q4_K_M.gguf", target)).toBe(true);
    // LM Studio publishes the same weights as gemma-4-12B-it
    expect(matchesModelFile("gemma-4-12B-it-Q4_K_M.gguf", target)).toBe(true);
  });

  it("matches node-llama-cpp download names", () => {
    expect(
      matchesModelFile("hf_unsloth_gemma-4-12b-it-Q4_K_M.gguf", target)
    ).toBe(true);
    expect(
      matchesModelFile(
        "hf_unsloth_gemma-4-12b-it-GGUF_gemma-4-12b-it-Q4_K_M.gguf",
        target
      )
    ).toBe(true);
  });

  it("does not match other quantizations or look-alikes", () => {
    expect(matchesModelFile("gemma-4-12b-it-Q8_0.gguf", target)).toBe(false);
    expect(
      matchesModelFile("Gemma-4-12B-OBLITERATED-Q4_K_M.gguf", target)
    ).toBe(false);
    expect(matchesModelFile("x_gemma-4-12b-it-Q4_K_M.gguf", target)).toBe(
      false
    );
  });

  it("matches aliases", () => {
    const qwen = getModelById("qwen3.8-27b")!;
    expect(matchesModelFile("Qwen3.8-27B-Q4_K_M.gguf", qwen.files[0]!)).toBe(
      true
    );
  });
});

describe("pickModelFile", () => {
  const q4 = file({ name: "q4.gguf", minVRAM: 16 });
  const iq3 = file({ name: "iq3.gguf", minVRAM: 0 });

  it("picks the best quantization the GPU meets", () => {
    expect(pickModelFile([q4, iq3], 24)).toBe(q4);
    expect(pickModelFile([q4, iq3], 16)).toBe(q4);
    expect(pickModelFile([q4, iq3], 12)).toBe(iq3);
  });

  it("falls back to the smallest when none qualifies", () => {
    const big = file({ name: "big.gguf", minVRAM: 24 });
    const mid = file({ name: "mid.gguf", minVRAM: 16 });
    expect(pickModelFile([big, mid], 8)).toBe(mid);
  });

  it("uses the best when hardware is unknown, nothing when empty", () => {
    expect(pickModelFile([q4, iq3], null)).toBe(q4);
    expect(pickModelFile([], 12)).toBeUndefined();
  });

  it("gives a 12 GB GPU the Qwen3.8 quantization that fits", () => {
    const qwen = getModelById("qwen3.8-27b")!;
    expect(pickModelFile(qwen.files, 12)?.name).toBe(
      "Qwen3.8-27B-UD-IQ3_XXS.gguf"
    );
    expect(pickModelFile(qwen.files, 24)?.name).toBe(
      "Qwen3.8-27B-UD-Q4_K_M.gguf"
    );
  });
});

describe("fit and recommendations", () => {
  const rtx4070 = { vramGB: 12, ramGB: 32 };
  const laptop = { vramGB: 6, ramGB: 16 };

  it("rates a variant against the machine", () => {
    const gemma12 = getModelById("gemma-4-12b")!;
    expect(getModelFit(gemma12, rtx4070)).toBe("good");
    expect(getModelFit(gemma12, { vramGB: 8, ramGB: 16 })).toBe("tight");
    expect(getModelFit(gemma12, laptop)).toBe("too-large");
    expect(getModelFit(gemma12, { vramGB: 12, ramGB: 8 })).toBe("too-large");
    expect(getModelFit(gemma12, null)).toBe("unknown");
    expect(getModelFit(gemma12, { vramGB: null, ramGB: 32 })).toBe("unknown");
  });

  it("recommends per family for a 12 GB GPU", () => {
    const pick = (id: string) =>
      getRecommendedVariant(
        MODEL_FAMILIES.find((f) => f.id === id)!,
        rtx4070
      )?.id;
    expect(pick("qwen")).toBe("qwen3-coder-30b");
    expect(pick("gemma")).toBe("gemma-4-12b");
    expect(pick("bonsai")).toBe("bonsai-2-27b");
  });

  it("recommends the small Gemma on a small GPU, and no Qwen", () => {
    const pick = (id: string) =>
      getRecommendedVariant(
        MODEL_FAMILIES.find((f) => f.id === id)!,
        laptop
      )?.id;
    expect(pick("gemma")).toBe("gemma-4-e4b");
    expect(pick("qwen")).toBeUndefined();
  });

  it("recommends nothing when the hardware is unknown", () => {
    expect(getRecommendedVariant(MODEL_FAMILIES[0]!, null)).toBeUndefined();
  });
});
