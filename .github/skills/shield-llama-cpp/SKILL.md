---
name: shield-llama-cpp
description: node-llama-cpp integration patterns for SHIELD 2.0. Use this when working with LLM inference, model loading, or AI functionality.
---

# SHIELD 2.0 LLM Integration (node-llama-cpp)

## Overview

SHIELD uses node-llama-cpp for local LLM inference. All AI processing happens on the user's machine.

## Model Loading

```typescript
import { getLlama, LlamaChatSession } from "node-llama-cpp";

// Get llama instance
const llama = await getLlama();

// Load model with options
const model = await llama.loadModel({
  modelPath: "/path/to/model.gguf",
  gpuLayers: settings.gpuLayers ?? "auto", // GPU offloading
});

// Create context
const context = await model.createContext({
  contextSize: settings.contextSize ?? 8192,
});

// Create chat session
const session = new LlamaChatSession({
  contextSequence: context.getSequence(),
  systemPrompt: systemPrompt,
});
```

## Streaming Response

```typescript
async function* streamResponse(
  session: LlamaChatSession,
  prompt: string
): AsyncGenerator<string> {
  const response = session.prompt(prompt, {
    maxTokens: 2048,
    temperature: 0.7,
    onTextChunk: (chunk) => {
      // Handle streaming chunk
    },
  });

  for await (const chunk of response) {
    yield chunk;
  }
}
```

## Model Configuration

```typescript
interface ModelSettings {
  gpuLayers: number | "auto"; // GPU layer offloading
  contextSize: number; // Context window (tokens)
  batchSize: number; // Batch processing size
  threads: number; // CPU threads
}

// Recommended defaults
const defaults: ModelSettings = {
  gpuLayers: "auto",
  contextSize: 8192,
  batchSize: 512,
  threads: 4,
};
```

## Memory Management

```typescript
// Dispose resources when done
async function cleanup() {
  if (session) {
    await session.dispose();
  }
  if (context) {
    await context.dispose();
  }
  if (model) {
    await model.dispose();
  }
}

// Handle insufficient VRAM
model.on("warning", (warning) => {
  if (warning.includes("VRAM")) {
    // Notify user via toast
    toast.warning(warning);
  }
});
```

## Speculative Decoding

SHIELD supports InputLookupTokenPredictor for faster inference:

```typescript
import { InputLookupTokenPredictor } from "node-llama-cpp";

const predictor = new InputLookupTokenPredictor({
  inputTokens: tokenize(inputText),
  maxPredictions: 3,
});

const response = await session.prompt(prompt, {
  tokenPredictor: predictor,
});
```

## System Prompts

Model-specific system prompts based on capabilities:

```typescript
interface ModelCapabilities {
  toolCalling: boolean;
  webSearch: boolean;
  reasoning: boolean;
  codeGeneration: boolean;
}

function buildSystemPrompt(
  capabilities: ModelCapabilities,
  modelFamily: string
): string {
  const modules: string[] = [BASE_PROMPT];

  if (capabilities.toolCalling) {
    modules.push(TOOL_CALLING_PROMPT);
  }
  if (capabilities.reasoning) {
    modules.push(REASONING_PROMPT);
  }
  // ... compose based on capabilities

  return modules.join("\n\n");
}
```

## Error Handling

```typescript
try {
  const model = await llama.loadModel({ modelPath });
} catch (error) {
  if (error.message.includes("VRAM")) {
    // Handle GPU memory issue
    return loadWithReducedContext();
  }
  if (error.message.includes("not found")) {
    // Handle missing model
    return promptModelDownload();
  }
  throw error;
}
```

## Supported Model Formats

- GGUF format only
- Quantizations: Q4_K_M, Q5_K_M, Q6_K recommended
- Split models supported (00001-of-00002.gguf)
