/** Exercise the shipped Gemma runtime and SHIELD tool loop on disposable files.
 * npx tsx scripts/bench/gemma-smoke.ts --models-dir D:/AIMODELS
 *
 * Other library models: `--model <catalog id>` (e.g. bonsai-27b, which needs
 * SHIELD_LLAMA_SERVER), `--family qwen|gemma` for the prompt style (default
 * gemma for gemma models, qwen otherwise), `--context 8192`, `--max-tokens 1536`.
 */
import fs from "node:fs";
import path from "node:path";
import { ModelRuntime } from "../../src/services/ModelRuntime";
import { getModelById } from "../../src/config/models";
import {
  buildSystemPrompt,
  getCapabilitiesFromModel,
} from "../../src/config/systemPrompts";
import { processMCPToolCalls } from "../../src/handlers/mcpMessageHandler";
import { startMCP, toToolDefinition } from "./mcp";
import { TASKS } from "./tasks";
import type { Message } from "../../src/hooks/useLlama";

const args = process.argv.slice(2);
const modelsDir = args[args.indexOf("--models-dir") + 1];
if (!args.includes("--models-dir") || !modelsDir) {
  throw new Error("Supply --models-dir with your installed Gemma model folder");
}
const option = (name: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const model = getModelById(option("--model") ?? "gemma-4-12b");
if (!model) throw new Error(`Unknown model "${option("--model")}"`);
const isGemma = model.familyId === "gemma";
const family = (option("--family") ?? (isGemma ? "gemma" : "qwen")) as
  "gemma" | "qwen";
const contextSize = Number(option("--context") ?? 8192);
const maxTokens = Number(option("--max-tokens") ?? 1536);
const runtime = new ModelRuntime();
runtime.setCustomModelsDir(modelsDir);
const root = path.resolve("tmp");
fs.mkdirSync(root, { recursive: true });
const runDir = fs.mkdtempSync(path.join(root, "gemma-smoke-"));
const results: unknown[] = [];
let failed = false;
const selected = args.includes("--cases")
  ? args[args.indexOf("--cases") + 1]?.split(",")
  : undefined;

try {
  await runtime.initialize();
  const loaded = await runtime.loadModel({
    ...model,
    contextSize,
    ...(args.includes("--no-speculation")
      ? { speculativeDecoding: false }
      : {}),
  });
  if (loaded.memory) throw new Error(loaded.memory.problems.join(" "));
  for (const task of TASKS.filter(
    (item) => !selected || selected.includes(item.id)
  )) {
    const dir = path.join(runDir, task.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(task.files)) {
      const target = path.join(dir, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const mcp = await startMCP(dir, { denyMutations: !!task.denyMutations });
    try {
      const tools = mcp.rawTools.map((tool) => ({
        ...toToolDefinition(tool),
        inputSchema: tool.inputSchema,
      }));
      await runtime.applySystemPrompt(
        buildSystemPrompt({
          modelFamily: family,
          capabilities: getCapabilitiesFromModel(model.capabilities),
          mcpEnabled: true,
          nativeTools: isGemma,
          availableTools: tools,
          allowedPaths: [dir],
        }).prompt,
        tools
      );
      runtime.clearHistory();
      const messages: Message[] = [];
      const start = performance.now();
      let lastProgress = 0;
      const options = {
        temperature: 0,
        maxTokens,
        signal: AbortSignal.timeout(120_000),
        onToken: (text: string) => process.stdout.write(text),
        onProgress: (progress: {
          phase: string;
          generated?: number;
          contextUsed?: number;
        }) => {
          if (performance.now() - lastProgress > 5000) {
            lastProgress = performance.now();
            console.log(
              JSON.stringify({
                task: task.id,
                elapsed: (performance.now() - start) / 1000,
                ...progress,
              })
            );
          }
        },
      };
      let answer = await runtime.chat(task.prompt(dir), options);
      const transcript = [answer];
      await processMCPToolCalls(
        {
          id: task.id,
          role: "assistant",
          content: answer,
          timestamp: new Date(),
        },
        {
          onToolCallDetected: (call) =>
            mcp.execute(call.serverName, call.tool, call.arguments),
          addMessage: (message) => messages.push(message),
          maxToolRounds: 6,
          maxToolCallsPerTurn: 1,
          maxResultChars: 5000,
          workspaceFolder: dir,
          continueConversation: async (text, toolResults) => {
            answer = await runtime.chat(text, { ...options, toolResults });
            transcript.push(answer);
            return answer;
          },
        }
      );
      const check = task.check({ dir, answer, calls: mcp.calls });
      failed ||= !check.pass;
      const record = {
        task: task.id,
        ...check,
        seconds: (performance.now() - start) / 1000,
        calls: mcp.calls,
        answer,
        transcript,
        messages,
        stats: runtime.getLastStats(),
      };
      results.push(record);
      console.log(
        JSON.stringify({
          task: task.id,
          ...check,
          seconds: record.seconds,
          calls: mcp.calls.map((call) => ({
            tool: call.tool,
            ok: call.ok,
            blocked: call.blocked,
          })),
          answer,
        })
      );
      fs.writeFileSync(
        path.join(runDir, "results.json"),
        JSON.stringify(results, null, 2)
      );
    } finally {
      await mcp.close();
    }
  }
} finally {
  await runtime.dispose();
  console.log(`${model.displayName} smoke evidence: ${runDir}`);
}
if (failed) process.exitCode = 1;
