import type { ModelOption } from "../components/chat/ModelSelector";

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
 * Hardware Requirements
 */
export interface HardwareRequirements {
  /** Minimum VRAM in GB */
  minVRAM: number;
  /** Recommended VRAM in GB */
  recommendedVRAM: number;
  /** Minimum system RAM in GB */
  minRAM: number;
  /** Recommended system RAM in GB */
  recommendedRAM: number;
}

/**
 * Model metadata for catalog and UI display
 */
export interface ModelMetadata {
  /** Model identifier */
  id: string;
  /** Full model name */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Hugging Face download URI */
  uri: string;
  /** File size as string */
  size: string;
  /** Brief description */
  description: string;
  /** Context window size in tokens */
  contextSize: number;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Hardware requirements */
  hardware: HardwareRequirements;
  /** Release/training date */
  releaseDate?: string;
  /** Model family/provider */
  provider: "Meta" | "Alibaba" | "Mistral" | "Microsoft" | "Google" | "Other";
  /** Is this model currently installed? */
  isInstalled?: boolean;
  /** Download progress (0-100) if downloading */
  downloadProgress?: number;
}

/**
 * Currently installed/active models
 * These are loaded by default and shown in the quick-access dropdown
 */
export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "qwen-7b",
    name: "Qwen2.5-7B-Instruct",
    displayName: "Qwen 7B",
    uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
    size: "4.2GB",
    description: "Excellent multilingual understanding, balanced performance",
    contextSize: 8192,
    capabilities: {
      toolCalling: false,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "excellent",
      temperatureRange: { min: 0.1, max: 1.5, default: 0.7 },
    },
  },
  {
    id: "llama-3b",
    name: "Llama-3.2-3B-Instruct",
    displayName: "Llama 3B",
    uri: "hf:meta-llama/Llama-3.2-3B-Instruct-GGUF:Q4_K_M",
    size: "1.9GB",
    description: "Faster responses, smaller model, good for quick tasks",
    contextSize: 4096,
    capabilities: {
      toolCalling: false,
      complexReasoning: false,
      webSearch: true,
      structuredOutput: false,
      longContext: false,
      codeGeneration: false,
      multilingual: "basic",
      temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
    },
  },
  {
    id: "mistral-7b",
    name: "Mistral-7B-Instruct",
    displayName: "Mistral 7B",
    uri: "hf:mistralai/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M",
    size: "4.1GB",
    description: "Strong reasoning capabilities, alternative to Qwen",
    contextSize: 8192,
    capabilities: {
      toolCalling: false,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "good",
      temperatureRange: { min: 0.1, max: 1.2, default: 0.7 },
    },
  },
];

/**
 * Complete model catalog - Available for download
 * Curated list of high-quality models from trusted sources
 */
export const MODEL_CATALOG: ModelMetadata[] = [
  // === PREMIUM TIER: Tool Calling & Advanced Features ===
  {
    id: "llama-3.3-70b",
    name: "Llama-3.3-70B-Instruct",
    displayName: "Llama 3.3 70B",
    uri: "hf:meta-llama/Llama-3.3-70B-Instruct-GGUF:Q4_K_M",
    size: "40GB",
    description:
      "🌟 Meta's flagship model with native tool calling. Exceptional reasoning and coding.",
    contextSize: 131072,
    provider: "Meta",
    releaseDate: "2024-12",
    capabilities: {
      toolCalling: true,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "excellent",
      temperatureRange: { min: 0.0, max: 1.5, default: 0.6 },
    },
    hardware: {
      minVRAM: 24,
      recommendedVRAM: 32,
      minRAM: 32,
      recommendedRAM: 64,
    },
  },
  {
    id: "qwen-2.5-coder-32b",
    name: "Qwen2.5-Coder-32B-Instruct",
    displayName: "Qwen 2.5 Coder 32B",
    uri: "hf:Qwen/Qwen2.5-Coder-32B-Instruct-GGUF:Q4_K_M",
    size: "18GB",
    description:
      "🌟 Specialized coding model with tool calling. Best for development tasks.",
    contextSize: 32768,
    provider: "Alibaba",
    releaseDate: "2024-11",
    capabilities: {
      toolCalling: true,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "excellent",
      temperatureRange: { min: 0.0, max: 1.2, default: 0.5 },
    },
    hardware: {
      minVRAM: 16,
      recommendedVRAM: 20,
      minRAM: 24,
      recommendedRAM: 32,
    },
  },
  {
    id: "mistral-large-2",
    name: "Mistral-Large-2-Instruct",
    displayName: "Mistral Large 2",
    uri: "hf:mistralai/Mistral-Large-Instruct-2407-GGUF:Q4_K_M",
    size: "70GB",
    description:
      "🌟 Mistral's most capable model with function calling. Excellent for complex tasks.",
    contextSize: 131072,
    provider: "Mistral",
    releaseDate: "2024-07",
    capabilities: {
      toolCalling: true,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "excellent",
      temperatureRange: { min: 0.0, max: 1.0, default: 0.6 },
    },
    hardware: {
      minVRAM: 40,
      recommendedVRAM: 48,
      minRAM: 64,
      recommendedRAM: 128,
    },
  },

  // === HIGH PERFORMANCE TIER: 7B-14B Models ===
  {
    id: "qwen-7b",
    name: "Qwen2.5-7B-Instruct",
    displayName: "Qwen 7B",
    uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
    size: "4.2GB",
    description: "Excellent multilingual understanding, balanced performance",
    contextSize: 8192,
    provider: "Alibaba",
    releaseDate: "2024-09",
    capabilities: {
      toolCalling: false,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "excellent",
      temperatureRange: { min: 0.1, max: 1.5, default: 0.7 },
    },
    hardware: {
      minVRAM: 6,
      recommendedVRAM: 8,
      minRAM: 8,
      recommendedRAM: 16,
    },
    isInstalled: true, // Pre-installed
  },
  {
    id: "mistral-7b",
    name: "Mistral-7B-Instruct",
    displayName: "Mistral 7B",
    uri: "hf:mistralai/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M",
    size: "4.1GB",
    description: "Strong reasoning capabilities, alternative to Qwen",
    contextSize: 8192,
    provider: "Mistral",
    releaseDate: "2024-05",
    capabilities: {
      toolCalling: false,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "good",
      temperatureRange: { min: 0.1, max: 1.2, default: 0.7 },
    },
    hardware: {
      minVRAM: 6,
      recommendedVRAM: 8,
      minRAM: 8,
      recommendedRAM: 16,
    },
    isInstalled: true, // Pre-installed
  },
  {
    id: "phi-3-14b",
    name: "Phi-3-Medium-14B-Instruct",
    displayName: "Phi-3 Medium 14B",
    uri: "hf:microsoft/Phi-3-medium-128k-instruct-GGUF:Q4_K_M",
    size: "8GB",
    description:
      "Microsoft's efficient model with 128K context. Great for long documents.",
    contextSize: 131072,
    provider: "Microsoft",
    releaseDate: "2024-06",
    capabilities: {
      toolCalling: false,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "good",
      temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
    },
    hardware: {
      minVRAM: 10,
      recommendedVRAM: 12,
      minRAM: 12,
      recommendedRAM: 16,
    },
  },

  // === EFFICIENT TIER: Small & Fast Models ===
  {
    id: "llama-3b",
    name: "Llama-3.2-3B-Instruct",
    displayName: "Llama 3B",
    uri: "hf:meta-llama/Llama-3.2-3B-Instruct-GGUF:Q4_K_M",
    size: "1.9GB",
    description: "Faster responses, smaller model, good for quick tasks",
    contextSize: 4096,
    provider: "Meta",
    releaseDate: "2024-09",
    capabilities: {
      toolCalling: false,
      complexReasoning: false,
      webSearch: true,
      structuredOutput: false,
      longContext: false,
      codeGeneration: false,
      multilingual: "basic",
      temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
    },
    hardware: {
      minVRAM: 4,
      recommendedVRAM: 6,
      minRAM: 4,
      recommendedRAM: 8,
    },
    isInstalled: true, // Pre-installed
  },
  {
    id: "llama-1b",
    name: "Llama-3.2-1B-Instruct",
    displayName: "Llama 1B",
    uri: "hf:meta-llama/Llama-3.2-1B-Instruct-GGUF:Q4_K_M",
    size: "700MB",
    description:
      "Ultra-fast responses, minimal resource usage. Perfect for testing.",
    contextSize: 4096,
    provider: "Meta",
    releaseDate: "2024-09",
    capabilities: {
      toolCalling: false,
      complexReasoning: false,
      webSearch: false,
      structuredOutput: false,
      longContext: false,
      codeGeneration: false,
      multilingual: "basic",
      temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
    },
    hardware: {
      minVRAM: 2,
      recommendedVRAM: 4,
      minRAM: 2,
      recommendedRAM: 4,
    },
  },
  {
    id: "qwen-3b",
    name: "Qwen2.5-3B-Instruct",
    displayName: "Qwen 3B",
    uri: "hf:Qwen/Qwen2.5-3B-Instruct-GGUF:Q4_K_M",
    size: "1.9GB",
    description:
      "Compact multilingual model, good balance of speed and quality",
    contextSize: 8192,
    provider: "Alibaba",
    releaseDate: "2024-09",
    capabilities: {
      toolCalling: false,
      complexReasoning: false,
      webSearch: true,
      structuredOutput: true,
      longContext: false,
      codeGeneration: true,
      multilingual: "excellent",
      temperatureRange: { min: 0.1, max: 1.2, default: 0.7 },
    },
    hardware: {
      minVRAM: 4,
      recommendedVRAM: 6,
      minRAM: 4,
      recommendedRAM: 8,
    },
  },

  // === SPECIALIZED TIER: Purpose-Built Models ===
  {
    id: "deepseek-coder-7b",
    name: "DeepSeek-Coder-7B-Instruct",
    displayName: "DeepSeek Coder 7B",
    uri: "hf:deepseek-ai/deepseek-coder-7b-instruct-v1.5-GGUF:Q4_K_M",
    size: "4.3GB",
    description: "Specialized coding model, excellent for programming tasks",
    contextSize: 16384,
    provider: "Other",
    releaseDate: "2024-01",
    capabilities: {
      toolCalling: false,
      complexReasoning: true,
      webSearch: false,
      structuredOutput: true,
      longContext: true,
      codeGeneration: true,
      multilingual: "basic",
      temperatureRange: { min: 0.0, max: 1.0, default: 0.3 },
    },
    hardware: {
      minVRAM: 6,
      recommendedVRAM: 8,
      minRAM: 8,
      recommendedRAM: 16,
    },
  },
  {
    id: "gemma-2-9b",
    name: "Gemma-2-9B-Instruct",
    displayName: "Gemma 2 9B",
    uri: "hf:google/gemma-2-9b-it-GGUF:Q4_K_M",
    size: "5.4GB",
    description: "Google's efficient model with strong safety features",
    contextSize: 8192,
    provider: "Google",
    releaseDate: "2024-06",
    capabilities: {
      toolCalling: false,
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true,
      longContext: false,
      codeGeneration: true,
      multilingual: "good",
      temperatureRange: { min: 0.1, max: 1.0, default: 0.7 },
    },
    hardware: {
      minVRAM: 8,
      recommendedVRAM: 10,
      minRAM: 10,
      recommendedRAM: 16,
    },
  },
];

/**
 * Get model by ID from catalog
 */
export function getModelById(id: string): ModelMetadata | undefined {
  return MODEL_CATALOG.find((model) => model.id === id);
}

/**
 * Filter models by capability
 */
export function filterModelsByCapability(
  capability: keyof ModelCapabilities,
  value?: boolean | string
): ModelMetadata[] {
  return MODEL_CATALOG.filter((model) => {
    const capValue = model.capabilities[capability];
    if (value !== undefined) {
      return capValue === value;
    }
    return !!capValue;
  });
}

/**
 * Get models that support tool calling
 */
export function getToolCallingModels(): ModelMetadata[] {
  return filterModelsByCapability("toolCalling", true);
}

/**
 * Get installed models
 */
export function getInstalledModels(): ModelMetadata[] {
  return MODEL_CATALOG.filter((model) => model.isInstalled);
}
