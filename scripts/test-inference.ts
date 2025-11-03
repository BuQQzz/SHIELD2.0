#!/usr/bin/env node
import { getLlama, LlamaChatSession, resolveModelFile } from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelsDir = path.join(__dirname, "..", "models");

/**
 * Test inference with the downloaded model
 */

async function testInference() {
  console.log("=".repeat(60));
  console.log("SHIELD 2.0 - Model Inference Test");
  console.log("=".repeat(60));
  console.log();

  try {
    console.log("⚙️  Initializing llama.cpp...");
    const llama = await getLlama();
    console.log("✅ llama.cpp initialized\n");

    console.log("📦 Loading model...");
    const modelPath = await resolveModelFile(
      "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
      modelsDir
    );
    console.log(`   Path: ${modelPath}\n`);

    const model = await llama.loadModel({
      modelPath,
    });
    console.log("✅ Model loaded successfully\n");

    console.log("🧠 Creating context...");
    const context = await model.createContext({
      contextSize: 2048,
    });
    console.log("✅ Context created\n");

    console.log("💬 Starting chat session...");
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
    });
    console.log("✅ Session ready\n");

    console.log("=".repeat(60));
    console.log("Test: Simple Q&A");
    console.log("=".repeat(60));
    console.log();

    const prompt = "What is the capital of France?";
    console.log(`Question: ${prompt}\n`);
    console.log("Response:");

    const response = await session.prompt(prompt, {
      maxTokens: 100,
    });

    console.log(response);
    console.log();

    console.log("=".repeat(60));
    console.log("✅ Inference test successful!");
    console.log("=".repeat(60));
    console.log();
    console.log("💡 The model is working correctly!");
    console.log("   Next: Integrate with Electron main process\n");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

testInference();
