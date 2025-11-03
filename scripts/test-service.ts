#!/usr/bin/env node
import { getLlamaService } from "../src/services/LlamaService.js";

/**
 * Test the LlamaService wrapper
 */

async function testLlamaService() {
  console.log("=".repeat(60));
  console.log("SHIELD 2.0 - LlamaService Test");
  console.log("=".repeat(60));
  console.log();

  const service = getLlamaService();

  try {
    console.log("⚙️  Initializing LlamaService...");
    await service.initialize();
    console.log("✅ Service initialized\n");

    console.log("📦 Loading Qwen 7B model...");
    await service.loadModel({
      name: "Qwen2.5-7B-Instruct",
      uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
      contextSize: 2048,
    });
    console.log("✅ Model loaded\n");

    console.log("=".repeat(60));
    console.log("Test 1: Simple Chat");
    console.log("=".repeat(60));
    console.log();

    const question1 = "What is 2+2?";
    console.log(`User: ${question1}\n`);

    const response1 = await service.chat(question1, {
      maxTokens: 50,
    });

    console.log(`Assistant: ${response1}\n`);

    console.log("=".repeat(60));
    console.log("Test 2: Streaming Chat");
    console.log("=".repeat(60));
    console.log();

    const question2 = "Write a haiku about coding.";
    console.log(`User: ${question2}\n`);
    console.log("Assistant: ");

    await service.chatStreaming(
      question2,
      (token) => {
        process.stdout.write(token);
      },
      {
        maxTokens: 100,
        temperature: 0.8,
      }
    );

    console.log("\n");

    console.log("=".repeat(60));
    console.log("Test 3: Context Awareness");
    console.log("=".repeat(60));
    console.log();

    const question3 = "What was my first question?";
    console.log(`User: ${question3}\n`);

    const response3 = await service.chat(question3, {
      maxTokens: 50,
    });

    console.log(`Assistant: ${response3}\n`);

    console.log("=".repeat(60));
    console.log("✅ All tests passed!");
    console.log("=".repeat(60));
    console.log();

    const modelInfo = service.getModelInfo();
    console.log("Model Info:");
    console.log(`  Name: ${modelInfo?.name}`);
    console.log(`  Context Size: ${modelInfo?.contextSize} tokens`);
    console.log(`  Is Loaded: ${service.isModelLoaded()}`);
    console.log();

    console.log("💡 LlamaService is working correctly!");
    console.log("   Next: Integrate with Electron\n");

    await service.dispose();
  } catch (error) {
    console.error("❌ Test failed:", error);
    await service.dispose();
    process.exit(1);
  }
}

testLlamaService();
