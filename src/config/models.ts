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
}

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
      toolCalling: false, // Qwen 2.5 base doesn't support function calling well
      complexReasoning: true,
      webSearch: true,
      structuredOutput: true, // Can follow formats with good prompting
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
      toolCalling: false, // 3B model too small for reliable tool calling
      complexReasoning: false,
      webSearch: true,
      structuredOutput: false, // Small models struggle with strict formats
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
      toolCalling: false, // Mistral 7B doesn't have native tool calling
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
