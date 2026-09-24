/**
 * Model Library
 *
 * SHIELD ships a short, curated list: three families, a few variants each
 * (docs/MODEL_LIBRARY_PLAN.md). A variant names exact GGUF files rather than
 * a machine-specific path, so it is found wherever it sits in the models
 * folder - SHIELD's own downloads, LM Studio's publisher/repo folders, or a
 * hand-arranged collection.
 */

/**
 * Model Capabilities
 * Defines what features each model supports
 */
export interface ModelCapabilities {
  /** Supports structured tool calling (function calling) */
  toolCalling: boolean;
  /** Good at following complex instructions and reasoning */
  complexReasoning: boolean;
  /** Works well with web search integration */
  webSearch: boolean;
  /** Can follow strict output formats (JSON, XML) */
  structuredOutput: boolean;
  /** Supports longer context effectively */
  longContext: boolean;
  /** Good at code generation */
  codeGeneration: boolean;
  /** Multilingual support quality */
  multilingual: "excellent" | "good" | "basic";
  /** Recommended temperature range */
  temperatureRange: { min: number; max: number; default: number };
  /** Allow additional capability keys */
  [key: string]:
    | boolean
    | string
    | { min: number; max: number; default: number }
    | undefined;
}

/**
 * Hardware Requirements, in GB of VRAM / system RAM
 */
export interface HardwareRequirements {
  /** Below this the variant is not offered as an option */
  minVRAM: number;
  /** At or above this it runs well */
  recommendedVRAM: number;
  minRAM: number;
  recommendedRAM: number;
}

/** What a variant is for - shown as tags, used for filtering */
export type ModelRole =
  "agent" | "coding" | "chat" | "small" | "long-context" | "vision";

/**
 * The engine that runs a variant:
 * - node-llama-cpp: in-process
 * - llama-server: a SHIELD-managed llama.cpp server, for models that need
 *   placement node-llama-cpp cannot do (MoE experts in system RAM)
 * - prism-llama-server: needs PrismML's fork (not wired up yet)
 */
export type ModelRuntime =
  "node-llama-cpp" | "llama-server" | "prism-llama-server";

/** One downloadable GGUF file (one quantization) of a variant */
export interface ModelFile {
  /** Exact file name in the Hugging Face repo */
  name: string;
  /** Hugging Face repo, owner/name */
  hfRepo: string;
  sizeBytes: number;
  /** Smallest GPU (GB) this quantization is picked for */
  minVRAM: number;
  /** Other names the same weights are published under (e.g. LM Studio's) */
  aliases?: string[];
}

export type LibraryFamilyId = "qwen" | "gemma" | "bonsai";

/**
 * Model metadata for catalog and UI display - one variant of a family
 */
export interface ModelMetadata {
  /** Stable identifier - stored in settings and conversations */
  id: string;
  familyId: LibraryFamilyId;
  /** Full model name */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Download URI of the preferred file (hf:owner/repo/file.gguf) */
  uri: string;
  /** Size of the preferred file, for display */
  size: string;
  /** Brief description */
  description: string;
  /** Context window loaded by default, in tokens */
  contextSize: number;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Hardware requirements */
  hardware: HardwareRequirements;
  /** Release date (YYYY-MM) */
  releaseDate?: string;
  /** Model family/provider */
  provider: "Alibaba" | "Google" | "PrismML";
  /** Chat template format (qwen, gemma, ...) */
  chatTemplate: string;
  roles: ModelRole[];
  runtime: ModelRuntime;
  /** Quantizations, best quality first */
  files: ModelFile[];
  /** Requires HuggingFace authentication (gated model) */
  requiresAuth?: boolean;
}

export interface ModelFamilyEntry {
  id: LibraryFamilyId;
  name: string;
  provider: ModelMetadata["provider"];
  description: string;
  /** Preferred first */
  variants: ModelMetadata[];
}

/** An installed model as the app's pickers and hooks pass it around */
export interface ModelOption {
  id: string;
  name: string;
  displayName: string;
  uri: string;
  size: string;
  description: string;
  contextSize: number;
  capabilities?: ModelCapabilities;
  chatTemplate?: string;
  runtime: ModelRuntime;
}

/** The host's GPU memory and system RAM, in GB. null when unknown. */
export interface HardwareInfo {
  vramGB: number | null;
  ramGB: number | null;
}

// ---------------------------------------------------------------------------
// Helpers used to build the catalog
// ---------------------------------------------------------------------------

export function hfUri(file: ModelFile): string {
  return `hf:${file.hfRepo}/${file.name}`;
}

export function formatModelSize(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

type VariantSpec = Omit<
  ModelMetadata,
  "uri" | "size" | "familyId" | "files"
> & {
  files: [ModelFile, ...ModelFile[]];
};

function variants(
  familyId: LibraryFamilyId,
  specs: VariantSpec[]
): ModelMetadata[] {
  return specs.map((spec) => ({
    ...spec,
    familyId,
    uri: hfUri(spec.files[0]),
    size: formatModelSize(spec.files[0].sizeBytes),
  }));
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

export const MODEL_FAMILIES: ModelFamilyEntry[] = [
  {
    id: "qwen",
    name: "Qwen",
    provider: "Alibaba",
    description:
      "Qwen3-Coder for agent and coding work; Qwen3.8 for everyday use.",
    variants: variants("qwen", [
      {
        id: "qwen3-coder-30b",
        name: "Qwen3-Coder-30B-A3B-Instruct",
        displayName: "Qwen3 Coder 30B",
        description:
          "Mixture-of-experts coder, 3B parameters active per token. The best-tested model with SHIELD's tools. Its experts run from system RAM while everything else stays on the GPU.",
        // Measured on 12 GB: 32k keeps ~36 tok/s (docs/RUNTIME_SPEED_RESEARCH.md)
        contextSize: 32768,
        provider: "Alibaba",
        releaseDate: "2025-07",
        chatTemplate: "qwen",
        roles: ["agent", "coding"],
        runtime: "llama-server",
        files: [
          {
            name: "Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf",
            hfRepo: "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
            sizeBytes: 18_560_000_000,
            minVRAM: 0,
          },
        ],
        capabilities: {
          toolCalling: true,
          complexReasoning: true,
          webSearch: true,
          structuredOutput: true,
          longContext: true,
          codeGeneration: true,
          multilingual: "good",
          temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
        },
        hardware: {
          minVRAM: 8,
          recommendedVRAM: 12,
          minRAM: 24,
          recommendedRAM: 32,
        },
      },
      {
        id: "qwen3.8-27b",
        name: "Qwen3.8-27B",
        displayName: "Qwen3.8 27B",
        description:
          "Qwen's newest general model: chat, writing, reasoning and code. SHIELD picks the quantization that fits your GPU.",
        contextSize: 8192,
        provider: "Alibaba",
        releaseDate: "2026-08",
        chatTemplate: "qwen",
        roles: ["chat", "vision"],
        runtime: "node-llama-cpp",
        files: [
          {
            name: "Qwen3.8-27B-UD-Q4_K_M.gguf",
            hfRepo: "unsloth/Qwen3.8-27B-GGUF",
            sizeBytes: 16_460_000_000,
            minVRAM: 16,
            aliases: ["Qwen3.8-27B-Q4_K_M.gguf"],
          },
          {
            name: "Qwen3.8-27B-UD-IQ3_XXS.gguf",
            hfRepo: "unsloth/Qwen3.8-27B-GGUF",
            sizeBytes: 10_930_000_000,
            minVRAM: 0,
          },
        ],
        capabilities: {
          toolCalling: true,
          complexReasoning: true,
          webSearch: true,
          structuredOutput: true,
          longContext: true,
          codeGeneration: true,
          multilingual: "excellent",
          temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
        },
        hardware: {
          minVRAM: 12,
          recommendedVRAM: 16,
          minRAM: 16,
          recommendedRAM: 32,
        },
      },
    ]),
  },
  {
    id: "gemma",
    name: "Gemma 4",
    provider: "Google",
    description: "Fast everyday models that fit entirely on the GPU.",
    variants: variants("gemma", [
      {
        id: "gemma-4-12b",
        name: "Gemma-4-12B-it",
        displayName: "Gemma 4 12B",
        description:
          "Quick, capable everyday model. Fits entirely on a 12 GB GPU with room left for context.",
        contextSize: 8192,
        provider: "Google",
        chatTemplate: "gemma",
        roles: ["chat", "vision"],
        runtime: "node-llama-cpp",
        files: [
          {
            name: "gemma-4-12b-it-Q4_K_M.gguf",
            hfRepo: "unsloth/gemma-4-12b-it-GGUF",
            sizeBytes: 7_120_000_000,
            minVRAM: 0,
          },
        ],
        capabilities: {
          toolCalling: true,
          complexReasoning: true,
          webSearch: true,
          structuredOutput: true,
          longContext: true,
          codeGeneration: true,
          multilingual: "excellent",
          temperatureRange: { min: 0.1, max: 1.2, default: 0.7 },
        },
        hardware: {
          minVRAM: 8,
          recommendedVRAM: 10,
          minRAM: 16,
          recommendedRAM: 16,
        },
      },
      {
        id: "gemma-4-e4b",
        name: "Gemma-4-E4B-it",
        displayName: "Gemma 4 E4B",
        description:
          "Small and fast, for GPUs with 4-8 GB. Not yet benchmarked with SHIELD's tools.",
        contextSize: 8192,
        provider: "Google",
        chatTemplate: "gemma",
        roles: ["small", "chat", "vision"],
        runtime: "node-llama-cpp",
        files: [
          {
            name: "gemma-4-E4B-it-Q4_K_M.gguf",
            hfRepo: "unsloth/gemma-4-E4B-it-GGUF",
            sizeBytes: 4_980_000_000,
            minVRAM: 0,
          },
        ],
        capabilities: {
          toolCalling: true,
          complexReasoning: false,
          webSearch: true,
          structuredOutput: true,
          longContext: false,
          codeGeneration: true,
          multilingual: "good",
          temperatureRange: { min: 0.1, max: 1.2, default: 0.7 },
        },
        hardware: {
          minVRAM: 4,
          recommendedVRAM: 6,
          minRAM: 8,
          recommendedRAM: 16,
        },
      },
    ]),
  },
  {
    id: "bonsai",
    name: "Bonsai",
    provider: "PrismML",
    description:
      "Ternary-weight models: a 27B model in 6 GB, with a long context window on a mid-range GPU.",
    variants: variants("bonsai", [
      {
        id: "bonsai-2-27b",
        name: "Ternary-Bonsai-2-27B",
        displayName: "Bonsai 2 27B",
        description:
          "27B model at 1.58 bits per weight. Runs fully on a 12 GB GPU with a 64k context window. Needs PrismML's runtime, which SHIELD does not run yet.",
        contextSize: 65536,
        provider: "PrismML",
        chatTemplate: "generic",
        roles: ["long-context", "chat"],
        runtime: "prism-llama-server",
        files: [
          {
            name: "Ternary-Bonsai-2-27B-PTQ1_0.gguf",
            hfRepo: "prism-ml/Ternary-Bonsai-2-27B-gguf",
            sizeBytes: 5_950_000_000,
            minVRAM: 0,
          },
        ],
        capabilities: {
          toolCalling: true,
          complexReasoning: true,
          webSearch: true,
          structuredOutput: true,
          longContext: true,
          codeGeneration: true,
          multilingual: "good",
          temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
        },
        hardware: {
          minVRAM: 8,
          recommendedVRAM: 12,
          minRAM: 16,
          recommendedRAM: 32,
        },
      },
    ]),
  },
];

/** Every variant, in library order */
export const MODEL_CATALOG: ModelMetadata[] = MODEL_FAMILIES.flatMap(
  (family) => family.variants
);

/** Loaded at startup when nothing else has been chosen */
export const DEFAULT_MODEL_ID = "qwen3-coder-30b";

/**
 * Get model by ID from catalog
 */
export function getModelById(id: string): ModelMetadata | undefined {
  return MODEL_CATALOG.find((model) => model.id === id);
}

/** True for variants SHIELD can run today */
export function isRuntimeAvailable(model: Pick<ModelMetadata, "runtime">) {
  return model.runtime !== "prism-llama-server";
}

// ---------------------------------------------------------------------------
// Matching files on disk
// ---------------------------------------------------------------------------

/**
 * Whether a file on disk is this model file. Case-insensitive; also accepts
 * node-llama-cpp's download names, which prefix `hf_<owner>_[<repo>_]`.
 */
export function matchesModelFile(fileName: string, file: ModelFile): boolean {
  const name = fileName.toLowerCase();
  return [file.name, ...(file.aliases ?? [])].some((candidate) => {
    const target = candidate.toLowerCase();
    return (
      name === target || (name.startsWith("hf_") && name.endsWith(`_${target}`))
    );
  });
}

/**
 * The quantization to use on this GPU: the best one whose `minVRAM` it
 * meets, else the smallest. Unknown hardware gets the best.
 */
export function pickModelFile<T extends ModelFile>(
  files: T[],
  vramGB: number | null
): T | undefined {
  if (files.length === 0) return undefined;
  if (vramGB === null) return files[0];
  return files.find((file) => vramGB >= file.minVRAM) ?? files.at(-1);
}

// ---------------------------------------------------------------------------
// Fit and recommendations
// ---------------------------------------------------------------------------

/**
 * How well a variant suits this machine:
 * - "good": at or above the recommended VRAM
 * - "tight": runs, but slower or with less context
 * - "too-large": below the minimum VRAM or RAM
 * - "unknown": the hardware could not be read
 */
export type ModelFit = "good" | "tight" | "too-large" | "unknown";

export function getModelFit(
  model: Pick<ModelMetadata, "hardware">,
  hardware: HardwareInfo | null
): ModelFit {
  if (hardware?.vramGB == null) return "unknown";
  const { vramGB, ramGB } = hardware;
  const { minVRAM, recommendedVRAM, minRAM } = model.hardware;
  if (vramGB < minVRAM || (ramGB !== null && ramGB < minRAM)) {
    return "too-large";
  }
  return vramGB >= recommendedVRAM ? "good" : "tight";
}

/**
 * The variant to suggest from a family: the first that runs well here, else
 * the first that runs at all. Undefined when hardware is unknown or nothing
 * fits.
 */
export function getRecommendedVariant(
  family: Pick<ModelFamilyEntry, "variants">,
  hardware: HardwareInfo | null
): ModelMetadata | undefined {
  const fits = family.variants.map((variant) => ({
    variant,
    fit: getModelFit(variant, hardware),
  }));
  return (
    fits.find((entry) => entry.fit === "good")?.variant ??
    fits.find((entry) => entry.fit === "tight")?.variant
  );
}
