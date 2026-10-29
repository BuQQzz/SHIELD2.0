/**
 * Model Library
 *
 * SHIELD ships a short, curated list: three families, a few variants each
 * (docs/MODEL_LIBRARY_PLAN.md). A variant names exact GGUF files rather than
 * a machine-specific path, so it is found wherever it sits in the models
 * folder - SHIELD's own downloads, LM Studio's publisher/repo folders, or a
 * hand-arranged collection.
 */

import type { SamplingValues } from "../services/modelSampling";

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
 * - prism-llama-server: PrismML's llama.cpp fork, for the Bonsai low-bit
 *   formats (Q1_0, PQ2_0). SHIELD runs it like llama-server; the fork is a
 *   superset of upstream, so `SHIELD_LLAMA_SERVER` may point at either.
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
/**
 * How well a model runs an agent team (src/agents): "good" has been run as
 * one end to end, "untested" has not been shown to work or fail, "poor"
 * failed the check (the 8B called delegate with no role and gave up). A
 * model with no entry is "untested".
 */
export type TeamFit = "good" | "untested" | "poor";

export interface ModelTeamFit {
  fit: TeamFit;
  /** What was seen, in a sentence the user can read */
  note: string;
}

/**
 * Where llama-server puts a model, for one `--fit` misjudges: every layer
 * on the GPU, with smaller batches so the compute buffer fits beside them.
 * `--fit` kept moving Ternary Bonsai 2 27B's layers to the CPU on an 8 GB
 * GPU, even with room to spare: 2.8 tok/s at 64k, 8.2 at 24k; all on the
 * GPU at 24k with 512-token batches, 42.7 tok/s in 7.5 GB (2026-10-28).
 * With 2048-token batches it ran out of memory. A fixed placement fails at
 * load on a GPU too small for it, so hardware.minVRAM must cover it.
 */
export interface ServerPlacement {
  allLayersOnGpu: true;
  ubatchSize: number;
}

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
  /** How it does as the model of an agent team; see TeamFit */
  team?: ModelTeamFit;
  /** llama-server only: a fixed placement instead of `--fit` */
  serverPlacement?: ServerPlacement;
  /**
   * llama-server only: `reasoning_effort` sent with each request that
   * thinks, for a chat template that takes one (Bonsai 2's)
   */
  reasoningEffort?: string;
  /** Quantizations, best quality first */
  files: ModelFile[];
  /** Requires HuggingFace authentication (gated model) */
  requiresAuth?: boolean;
  /**
   * Sampling its makers recommend, for a model whose file does not say
   * (general.sampling in the GGUF comes first)
   */
  sampling?: Partial<SamplingValues>;
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
  team?: ModelTeamFit;
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
        team: {
          fit: "untested",
          note: "Not tried as a team: it needs an 18.6 GB download that did not fit the test machine.",
        },
        // Qwen's model card; its GGUF carries no sampling
        sampling: {
          temperature: 0.7,
          topP: 0.8,
          topK: 20,
          repeatPenalty: 1.05,
        },
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
      {
        id: "qwen3.5-9b",
        name: "Qwen3.5-9B",
        displayName: "Qwen3.5 9B",
        description:
          "Small Qwen for agent work on an 8 GB GPU: the usual pick at this size for tool calling. Q6_K on a 12 GB GPU.",
        contextSize: 32768,
        provider: "Alibaba",
        releaseDate: "2026-03",
        chatTemplate: "qwen",
        roles: ["agent", "coding", "chat"],
        runtime: "llama-server",
        team: {
          fit: "untested",
          note: "Added 2026-10-28 for a comparison with Bonsai; not run as a team yet.",
        },
        // Qwen's model card: thinking mode for precise coding tasks
        sampling: {
          temperature: 0.6,
          topP: 0.95,
          topK: 20,
          repeatPenalty: 1.0,
        },
        files: [
          {
            name: "Qwen3.5-9B-Q6_K.gguf",
            hfRepo: "unsloth/Qwen3.5-9B-GGUF",
            sizeBytes: 7_460_000_000,
            minVRAM: 12,
          },
          {
            name: "Qwen3.5-9B-Q4_K_M.gguf",
            hfRepo: "unsloth/Qwen3.5-9B-GGUF",
            sizeBytes: 5_680_000_000,
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
          temperatureRange: { min: 0.1, max: 1.0, default: 0.6 },
        },
        hardware: {
          minVRAM: 8,
          recommendedVRAM: 12,
          minRAM: 16,
          recommendedRAM: 16,
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
          "27B model at 1.58 bits per weight. Runs fully on an 8 GB GPU with a 24k context window, about 43 tok/s on an RTX 2070 SUPER.",
        // 32k ran out of memory on 8 GB; 24k used 7.5 GB (2026-10-28)
        contextSize: 24576,
        serverPlacement: { allLayersOnGpu: true, ubatchSize: 512 },
        // Prism's KNOWN_ISSUES: it loops on some prompts at the default
        // xhigh, and medium thinks less at about the same accuracy. Same
        // prompt, two runs each: default thought 2,518-7,333 tokens (62-179
        // s), medium 1,899-2,439 (46-59 s) with fuller answers (2026-10-29)
        reasoningEffort: "medium",
        provider: "PrismML",
        chatTemplate: "generic",
        roles: ["agent", "coding", "long-context", "chat"],
        runtime: "prism-llama-server",
        team: {
          fit: "untested",
          note: "Passed all six solo Code tasks in a three-round comparison, with one failed call (2026-10-29). Not run as a team yet.",
        },
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
      {
        id: "bonsai-2-9b",
        name: "Ternary-Bonsai-2-9B",
        displayName: "Bonsai 2 9B",
        description:
          "9B model at 2 bits per weight: 2.4 GB on disk, about twice as fast as the 27B.",
        contextSize: 32768,
        provider: "PrismML",
        chatTemplate: "generic",
        roles: ["small", "chat"],
        runtime: "prism-llama-server",
        team: {
          fit: "untested",
          note: "Passed one small bug fix as a team in the app (2026-10-22), about twice as fast as the 27B. Not tried on bigger tasks.",
        },
        files: [
          {
            name: "Ternary-Bonsai-2-9B-PQ2_0.gguf",
            hfRepo: "prism-ml/Ternary-Bonsai-2-9B-gguf",
            sizeBytes: 2_416_851_840,
            minVRAM: 0,
          },
        ],
        capabilities: {
          toolCalling: true,
          complexReasoning: true,
          webSearch: true,
          structuredOutput: true,
          longContext: true,
          codeGeneration: false,
          multilingual: "good",
          temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
        },
        hardware: {
          minVRAM: 4,
          recommendedVRAM: 6,
          minRAM: 8,
          recommendedRAM: 16,
        },
      },
      {
        id: "bonsai-8b",
        name: "Bonsai-8B",
        displayName: "Bonsai 8B",
        description:
          "8B model at 1 bit per weight: 1.2 GB on disk and very fast. Fine for chat, too weak for multi-step tool work.",
        contextSize: 32768,
        provider: "PrismML",
        chatTemplate: "generic",
        roles: ["small", "chat"],
        runtime: "prism-llama-server",
        team: {
          fit: "poor",
          note: "Failed the team check: it called the delegate tool with no role, so nothing was delegated (2026-10-22). Too weak for multi-step tool work.",
        },
        files: [
          {
            name: "Bonsai-8B-Q1_0.gguf",
            hfRepo: "prism-ml/Bonsai-8B-gguf",
            sizeBytes: 1_158_654_496,
            minVRAM: 0,
          },
        ],
        capabilities: {
          toolCalling: false,
          complexReasoning: false,
          webSearch: true,
          structuredOutput: false,
          longContext: false,
          codeGeneration: false,
          multilingual: "basic",
          temperatureRange: { min: 0.1, max: 1.0, default: 0.5 },
        },
        hardware: {
          minVRAM: 2,
          recommendedVRAM: 4,
          minRAM: 4,
          recommendedRAM: 8,
        },
      },
    ]),
  },
];

/** Every variant, in library order */
export const MODEL_CATALOG: ModelMetadata[] = MODEL_FAMILIES.flatMap(
  (family) => family.variants
);

/**
 * Loaded at startup when nothing else has been chosen, and suggested for
 * Code. Bonsai 2 27B fits an 8 GB GPU whole and passed all six tasks of a
 * three-round comparison (Bonsai 27B Q1_0, Bonsai 2 9B, Qwen3.5 9B each
 * failed or half-did at least one; docs/HANDOFF.md, 2026-10-29). It
 * replaced Qwen3-Coder-30B, whose experts spill into system RAM.
 */
export const DEFAULT_MODEL_ID = "bonsai-2-27b";

/**
 * Get model by ID from catalog
 */
export function getModelById(id: string): ModelMetadata | undefined {
  return MODEL_CATALOG.find((model) => model.id === id);
}

/** True for variants SHIELD can run today */
export function isRuntimeAvailable(model: Pick<ModelMetadata, "runtime">) {
  return model.runtime === "node-llama-cpp" || usesLlamaServer(model.runtime);
}

/** Whether a runtime is served by a SHIELD-managed llama-server process */
export function usesLlamaServer(runtime: ModelRuntime | undefined): boolean {
  return runtime === "llama-server" || runtime === "prism-llama-server";
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
