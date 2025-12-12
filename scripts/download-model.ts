#!/usr/bin/env node
import { resolveModelFile } from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, "..", "models");

/**
 * Download LLM models from Hugging Face using node-llama-cpp
 *
 * Recommended models for RTX 4070 (12GB VRAM):
 * - Qwen/Qwen2.5-7B-Instruct-GGUF (Q4_K_M) - ~4.4GB, excellent quality
 * - meta-llama/Llama-3.2-3B-Instruct-GGUF (Q4_K_M) - ~1.9GB, very fast
 * - mistralai/Mistral-7B-Instruct-v0.3-GGUF (Q4_K_M) - ~4.1GB, good balance
 */

// Predefined models with Hugging Face URI scheme: hf:<user>/<model>:<quant>
const MODELS = {
  "qwen-7b": {
    name: "Qwen2.5-7B-Instruct",
    uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
    size: "4.4GB",
    description: "Excellent multilingual model, fast inference",
  },
  "llama-3b": {
    name: "Llama-3.2-3B-Instruct",
    uri: "hf:meta-llama/Llama-3.2-3B-Instruct-GGUF:Q4_K_M",
    size: "1.9GB",
    description: "Smaller model, great for testing and quick responses",
  },
  "mistral-7b": {
    name: "Mistral-7B-Instruct-v0.3",
    uri: "hf:mistralai/Mistral-7B-Instruct-v0.3-GGUF:Q4_K_M",
    size: "4.1GB",
    description: "Great general purpose model with good reasoning",
  },
};

async function downloadModelFile(modelKey: string) {
  const model = MODELS[modelKey as keyof typeof MODELS];

  if (!model) {
    console.error(`\n❌ Unknown model: ${modelKey}`);
    console.log("\nAvailable models:");
    Object.entries(MODELS).forEach(([key, m]) => {
      console.log(`  ${key.padEnd(12)} - ${m.name} (${m.size})`);
      console.log(`                   ${m.description}`);
    });
    process.exit(1);
  }

  console.log(`\n📥 Downloading ${model.name}...`);
  console.log(`   URI: ${model.uri}`);
  console.log(`   Size: ~${model.size}`);
  console.log(`   Description: ${model.description}\n`);

  try {
    // resolveModelFile will automatically download if the model doesn't exist
    // Progress is shown in the console by default
    const modelPath = await resolveModelFile(model.uri, modelsDir);

    console.log(`\n✅ Model ready!`);
    console.log(`   Path: ${modelPath}`);
    console.log(`\n💡 Next: Test the model with:\n   npm run test:inference\n`);
  } catch (error) {
    console.error(`\n❌ Download failed:`, error);
    process.exit(1);
  }
}

// Parse command line arguments
const modelKey = process.argv[2];

if (!modelKey) {
  console.log("=".repeat(60));
  console.log("SHIELD - Model Downloader");
  console.log("=".repeat(60));
  console.log("\nUsage: npm run download-model <model-key>\n");
  console.log("Available models:");
  Object.entries(MODELS).forEach(([key, model]) => {
    console.log(`  ${key.padEnd(12)} - ${model.name} (${model.size})`);
    console.log(`                   ${model.description}`);
  });
  console.log("\nExample: npm run download-model qwen-7b");
  console.log("=".repeat(60));
  process.exit(0);
}

console.log("=".repeat(60));
console.log("SHIELD 2.0 - Model Downloader");
console.log("=".repeat(60));

downloadModelFile(modelKey);
