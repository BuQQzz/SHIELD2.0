/**
 * Speed probe for a running llama-server (llama.cpp HTTP API).
 *
 *   npx tsx scripts/bench/server-speed.ts [baseUrl] [label]
 *
 * Sends the same three SHIELD-like requests to /completion and prints the
 * server's own timings: prompt processing speed, decode speed and, when
 * speculative decoding is on, how many drafted tokens were accepted.
 *
 * - write: fresh code from a short prompt (drafts must predict new text)
 * - edit:  a file plus "return it with one change" (output repeats input,
 *          where n-gram lookup should shine)
 * - read:  a long file and a short summary (a tool result, then an answer)
 */

import fs from "fs";
import path from "path";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8090";
const label = process.argv[3] ?? "";

const root = path.join(import.meta.dirname, "../..");
const file = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// Qwen chat format, rendered by hand so every configuration sees identical tokens
const chat = (user: string) =>
  `<|im_start|>system\nYou are a helpful coding assistant.<|im_end|>\n` +
  `<|im_start|>user\n${user}<|im_end|>\n<|im_start|>assistant\n`;

const editSource = file("src/components/chat/conversationDates.ts");
const readSource = file("src/services/LlamaService.ts");

const tasks = [
  {
    name: "write",
    prompt: chat(
      "Write a TypeScript LRU cache class with get, set, delete and a max size. Code only."
    ),
    n: 300,
  },
  {
    name: "edit",
    prompt: chat(
      `Return this file unchanged except rename compactAge to formatAge everywhere. Output the whole file only.\n\n${editSource}`
    ),
    n: 500,
  },
  {
    name: "read",
    prompt: chat(
      `${readSource}\n\nIn 5 short bullets, what does the class above do?`
    ),
    n: 200,
  },
];

interface Timings {
  prompt_n: number;
  prompt_per_second: number;
  predicted_n: number;
  predicted_per_second: number;
  draft_n?: number;
  draft_n_accepted?: number;
}

for (const task of tasks) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: task.prompt,
      n_predict: task.n,
      temperature: 0,
      cache_prompt: false,
    }),
  });
  if (!response.ok) {
    console.log(`${label} ${task.name}: HTTP ${response.status}`);
    continue;
  }
  const { timings } = (await response.json()) as { timings: Timings };
  const wall = (performance.now() - started) / 1000;
  const drafts =
    timings.draft_n != null && timings.draft_n > 0
      ? `  drafts ${timings.draft_n_accepted}/${timings.draft_n} accepted`
      : "";
  console.log(
    `${label.padEnd(14)} ${task.name.padEnd(5)} ` +
      `prompt ${String(timings.prompt_n).padStart(5)} tok @ ${timings.prompt_per_second.toFixed(0).padStart(4)} tok/s  ` +
      `decode ${String(timings.predicted_n).padStart(3)} tok @ ${timings.predicted_per_second.toFixed(1).padStart(5)} tok/s  ` +
      `wall ${wall.toFixed(1)}s${drafts}`
  );
}
