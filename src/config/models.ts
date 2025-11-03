import type { ModelOption } from "../components/chat/ModelSelector";

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "qwen-7b",
    name: "Qwen2.5-7B-Instruct",
    displayName: "Qwen 7B",
    uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
    size: "4.2GB",
    description: "Excellent multilingual understanding, balanced performance",
    contextSize: 2048,
  },
  {
    id: "llama-3b",
    name: "Llama-3.2-3B-Instruct",
    displayName: "Llama 3B",
    uri: "hf:meta-llama/Llama-3.2-3B-Instruct-GGUF:Q4_K_M",
    size: "1.9GB",
    description: "Faster responses, smaller model, good for quick tasks",
    contextSize: 2048,
  },
  {
    id: "mistral-7b",
    name: "Mistral-7B-Instruct",
    displayName: "Mistral 7B",
    uri: "hf:mistralai/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M",
    size: "4.1GB",
    description: "Strong reasoning capabilities, alternative to Qwen",
    contextSize: 2048,
  },
];
