import { getLlama } from "node-llama-cpp";

/**
 * Test llama.cpp integration
 * This file verifies that node-llama-cpp is properly installed and configured
 */
async function testLlamaCpp() {
  try {
    console.log("Testing node-llama-cpp installation...\n");

    // Initialize llama
    const llama = await getLlama();
    console.log("✅ Successfully initialized llama.cpp");
    console.log(`   GPU: ${llama.gpu ? "Detected" : "Not available"}`);

    console.log("\n✅ node-llama-cpp is ready to use!");
    console.log("\nNext steps: Download a model to test inference");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

testLlamaCpp();
