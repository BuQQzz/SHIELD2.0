/** Exercise the shipped Gemma runtime and SHIELD tool loop on disposable files.
 * npx tsx scripts/bench/gemma-smoke.ts --models-dir D:/AIMODELS
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
const model = getModelById("gemma-4-12b")!;
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
    contextSize: 8192,
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
          modelFamily: "gemma",
          capabilities: getCapabilitiesFromModel(model.capabilities),
          mcpEnabled: true,
          nativeTools: true,
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
        maxTokens: 1536,
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
  console.log(`Gemma smoke evidence: ${runDir}`);
}
if (failed) process.exitCode = 1;
