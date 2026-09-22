#!/usr/bin/env node
/**
 * SHIELD Agent Benchmark
 *
 *   npm run bench:agent -- [--model <path.gguf>] [--strategies xml,native,native-qwen]
 *                          [--tasks id,id] [--repeat 3] [--context 8192]
 *                          [--temperature 0.7] [--verbose]
 *
 * Runs every task x strategy x repeat against a real filesystem MCP server in
 * a fresh temp directory, scores it deterministically, prints a summary and
 * writes the full trace to bench-results/.
 */

import { getLlama } from "node-llama-cpp";
import fs from "fs";
import os from "os";
import path from "path";
import { createFixture, startMCP, type CallRecord } from "./mcp";
import { STRATEGIES, type StrategyName } from "./strategies";
import { TASKS } from "./tasks";

interface RunResult {
  task: string;
  strategy: StrategyName;
  repeat: number;
  pass: boolean;
  reason?: string;
  answer: string;
  calls: CallRecord[];
  malformed: number;
  systemPromptTokens: number;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  crashed?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function defaultModel(): string {
  const dir = path.join(
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
    "shield",
    "models"
  );
  const gguf = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".gguf") && !/-0000[2-9]-of-/.test(f))
    .sort();
  if (gguf.length === 0) throw new Error(`No .gguf models in ${dir}`);
  return path.join(dir, gguf[0]!);
}

async function main() {
  const modelPath = arg("model") ?? defaultModel();
  const strategies = (arg("strategies") ?? "xml,native").split(
    ","
  ) as StrategyName[];
  const taskIds = arg("tasks")?.split(",");
  const repeats = Number(arg("repeat") ?? 3);
  const contextSize = Number(arg("context") ?? 8192);
  const temperature = Number(arg("temperature") ?? 0.7);
  const verbose = process.argv.includes("--verbose");

  for (const s of strategies) {
    if (!(s in STRATEGIES)) throw new Error(`Unknown strategy: ${s}`);
  }
  const tasks = TASKS.filter((t) => !taskIds || taskIds.includes(t.id));
  const modelName = path.basename(modelPath);

  console.log(`Model:      ${modelName}`);
  console.log(`Strategies: ${strategies.join(", ")}`);
  console.log(`Tasks:      ${tasks.length} x ${repeats} repeat(s)\n`);

  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath });
  const context = await model.createContext({ contextSize });

  const results: RunResult[] = [];

  for (const task of tasks) {
    for (const strategy of strategies) {
      for (let repeat = 0; repeat < repeats; repeat++) {
        const dir = createFixture(task.files);
        const mcp = await startMCP(dir, {
          denyMutations: !!task.denyMutations,
        });
        const started = Date.now();
        let result: RunResult;

        try {
          const run = await STRATEGIES[strategy]({
            model,
            context,
            modelName,
            mcp,
            dir,
            prompt: task.prompt(dir),
            sampling: {
              temperature,
              maxTokens: 512,
              topP: 0.9,
              topK: 40,
              repeatPenalty: 1.1,
              // Same seed per repeat across strategies
              seed: 1000 + repeat,
            },
          });
          const verdict = task.check({
            dir,
            answer: run.answer,
            calls: mcp.calls,
          });
          result = {
            task: task.id,
            strategy,
            repeat,
            ...verdict,
            ...run,
            calls: mcp.calls,
            ms: Date.now() - started,
          };
        } catch (error) {
          result = {
            task: task.id,
            strategy,
            repeat,
            pass: false,
            reason: "crashed",
            crashed: error instanceof Error ? error.stack : String(error),
            answer: "",
            calls: mcp.calls,
            malformed: 0,
            systemPromptTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            ms: Date.now() - started,
          };
        } finally {
          await mcp.close();
          fs.rmSync(dir, { recursive: true, force: true });
        }

        results.push(result);
        const mark = result.pass ? "PASS" : "FAIL";
        console.log(
          `${mark}  ${task.id.padEnd(18)} ${strategy.padEnd(11)} #${repeat}  ` +
            `${result.calls.length} call(s)  ${(result.ms / 1000).toFixed(1)}s` +
            (result.pass ? "" : `  - ${result.reason}`)
        );
        if (verbose) {
          for (const c of result.calls) {
            console.log(
              `        ${c.ok ? "ok " : c.blocked ? "blk" : "err"} ${c.tool} ${JSON.stringify(c.args).slice(0, 120)}` +
                (c.duplicate ? "  [duplicate]" : "")
            );
          }
          console.log(
            `        answer: ${result.answer.slice(0, 200).replace(/\n/g, " ")}`
          );
          if (result.crashed) console.log(result.crashed);
        }
      }
    }
  }

  printSummary(
    results,
    tasks.map((t) => t.id),
    strategies
  );

  const outDir = path.join(process.cwd(), "bench-results");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(
    outDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${modelName}.json`
  );
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      { modelPath, contextSize, temperature, repeats, strategies, results },
      null,
      2
    )
  );
  console.log(`\nFull trace: ${outFile}`);

  await context.dispose();
  await model.dispose();
}

function printSummary(
  results: RunResult[],
  taskIds: string[],
  strategies: StrategyName[]
) {
  const pct = (n: number, d: number) =>
    d === 0 ? "-" : `${Math.round((100 * n) / d)}%`;
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

  console.log("\nPass rate by task");
  console.log(
    "task".padEnd(20) + strategies.map((s) => s.padStart(12)).join("")
  );
  for (const id of taskIds) {
    const cells = strategies.map((s) => {
      const rs = results.filter((r) => r.task === id && r.strategy === s);
      return `${rs.filter((r) => r.pass).length}/${rs.length}`.padStart(12);
    });
    console.log(id.padEnd(20) + cells.join(""));
  }

  console.log("\nTotals");
  const rows: Array<[string, (rs: RunResult[]) => string]> = [
    ["pass rate", (rs) => pct(rs.filter((r) => r.pass).length, rs.length)],
    ["tool calls / run", (rs) => avg(rs.map((r) => r.calls.length)).toFixed(1)],
    [
      "failed calls",
      (rs) =>
        String(
          rs.flatMap((r) => r.calls).filter((c) => !c.ok && !c.blocked).length
        ),
    ],
    [
      "duplicate calls",
      (rs) =>
        String(rs.flatMap((r) => r.calls).filter((c) => c.duplicate).length),
    ],
    [
      "malformed replies",
      (rs) => String(rs.reduce((a, r) => a + r.malformed, 0)),
    ],
    ["crashes", (rs) => String(rs.filter((r) => r.crashed).length)],
    [
      "system prompt tok",
      (rs) => avg(rs.map((r) => r.systemPromptTokens)).toFixed(0),
    ],
    ["input tok / run", (rs) => avg(rs.map((r) => r.inputTokens)).toFixed(0)],
    ["output tok / run", (rs) => avg(rs.map((r) => r.outputTokens)).toFixed(0)],
    ["seconds / run", (rs) => (avg(rs.map((r) => r.ms)) / 1000).toFixed(1)],
  ];
  console.log(
    "metric".padEnd(20) + strategies.map((s) => s.padStart(12)).join("")
  );
  for (const [label, fn] of rows) {
    console.log(
      label.padEnd(20) +
        strategies
          .map((s) => fn(results.filter((r) => r.strategy === s)).padStart(12))
          .join("")
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
