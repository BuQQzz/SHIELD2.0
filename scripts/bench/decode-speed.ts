/**
 * Decode-speed probe for SHIELD's own runtime path (node-llama-cpp), so it
 * can be compared with llama.cpp's llama-bench on the same model.
 *
 *   npx tsx scripts/bench/decode-speed.ts <model.gguf> [contextSize] [gpuLayers]
 *
 * Loads the model the way LlamaService does, then times a short prompt and
 * a long (~8k token) one, with and without the InputLookupTokenPredictor
 * that SHIELD enables by default.
 */

import fs from "fs";
import path from "path";
import {
  getLlama,
  InputLookupTokenPredictor,
  LlamaChatSession,
  resolveChatWrapper,
} from "node-llama-cpp";

const modelPath = process.argv[2];
const contextSize = Number(process.argv[3] ?? 32768);
// Explicit layer count; default is SHIELD's own fitContext placement
const gpuLayersArg = process.argv[4] ? Number(process.argv[4]) : undefined;
if (!modelPath) {
  console.error("usage: decode-speed.ts <model.gguf> [contextSize]");
  process.exit(1);
}

// ~8k tokens of real code for the long prompt
const source = fs.readFileSync(
  path.join(import.meta.dirname, "../../src/services/LlamaService.ts"),
  "utf8"
);
const longPrompt =
  source.repeat(4) + "\n\nSummarise what the class above does in 5 bullets.";
const shortPrompt =
  "Write a TypeScript function that debounces another function.";

const llama = await getLlama();
const model = await llama.loadModel({
  modelPath,
  gpuLayers: gpuLayersArg ?? { fitContext: { contextSize } },
});
console.log(`gpuLayers ${model.gpuLayers}, context ${contextSize}`);

const predictors = process.env.PREDICTOR === "both" ? [false, true] : [false];
for (const predictor of predictors) {
  const context = await model.createContext({ contextSize });
  for (const [label, prompt] of [
    ["short", shortPrompt],
    ["long", longPrompt],
  ] as const) {
    const sequence = context.getSequence({
      tokenPredictor: predictor
        ? new InputLookupTokenPredictor({
            patternLength: { min: 2 },
            predictionLength: { max: 3 },
          })
        : undefined,
    });
    const session = new LlamaChatSession({
      contextSequence: sequence,
      chatWrapper: resolveChatWrapper(model),
    });
    const started = performance.now();
    let first: number | null = null;
    const outBefore = sequence.tokenMeter.usedOutputTokens;
    await session.prompt(prompt, {
      maxTokens: 160,
      temperature: 0.7,
      onTextChunk: () => {
        first ??= performance.now();
      },
    });
    const ended = performance.now();
    const out = sequence.tokenMeter.usedOutputTokens - outBefore;
    console.log(
      `predictor=${predictor ? "on " : "off"} ${label.padEnd(5)} ` +
        `ttft ${(((first ?? ended) - started) / 1000).toFixed(1)}s  ` +
        `decode ${(out / ((ended - (first ?? started)) / 1000)).toFixed(1)} tok/s  ` +
        `(${out} tokens, depth ${sequence.nextTokenIndex})`
    );
    session.dispose();
    sequence.dispose();
  }
  await context.dispose();
}

await model.dispose();
await llama.dispose();
