/**
 * Run the agent team headless on a fixture project: an orchestrator that can
 * only delegate, and a coder, tester and reviewer that work in sessions of
 * their own on the same model. Real model, real filesystem tool server, real
 * terminal tool; tool calls are approved automatically (Auto mode).
 *
 *   SHIELD_LLAMA_SERVER=... npx tsx scripts/bench/agent-team.ts \
 *     --models-dir ~/models --model bonsai-27b [--context 32768] \
 *     [--scenario fix|build] [--checkpoint 0.7] [--max-tokens 4096]
 *
 * `--checkpoint 0.15` cuts agents off early on purpose, to see a fresh agent
 * continue from the hand-off. Evidence is written to tmp/agent-team-*.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ModelRuntime } from "../../src/services/ModelRuntime";
import { getModelById } from "../../src/config/models";
import {
  buildSystemPrompt,
  detectModelFamily,
} from "../../src/config/systemPrompts";
import { processMCPToolCalls } from "../../src/handlers/mcpMessageHandler";
import { handleDelegate } from "../../src/agents/delegation";
import { DELEGATE_TOOL, TEAM_NOTE_TOOL } from "../../src/agents/delegate";
import { ORCHESTRATOR_PROMPT, toolsForRole } from "../../src/agents/roles";
import { TeamRun } from "../../src/agents/team";
import type { AgentRunDeps } from "../../src/agents/agentRunner";
import {
  isTerminalTool,
  runCommand,
  runCommandTool,
} from "../../electron/services/terminalTool";
import { createFixture, startMCP, toToolDefinition } from "./mcp";
import type { ToolDefinition } from "../../src/types/prompts";

const args = process.argv.slice(2);
const option = (name: string) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const modelsDir = option("--models-dir");
if (!modelsDir) throw new Error("Supply --models-dir");
const model = getModelById(option("--model") ?? "bonsai-27b");
if (!model) throw new Error(`Unknown model "${option("--model")}"`);
const contextSize = Number(option("--context") ?? 32768);
const maxTokens = Number(option("--max-tokens") ?? 4096);
const checkpointAt = option("--checkpoint")
  ? Number(option("--checkpoint"))
  : undefined;
const scenario = option("--scenario") ?? "fix";

const SCENARIOS: Record<
  string,
  { files: Record<string, string>; request: string }
> = {
  fix: {
    files: {
      "add.sh":
        "#!/usr/bin/env bash\n# prints the sum of two numbers\necho $(( $1 - $2 ))\n",
      "test.sh":
        '#!/usr/bin/env bash\ncd "$(dirname "$0")"\ngot=$(bash add.sh 2 3)\nif [ "$got" = "5" ]; then echo "PASS add 2 3 = 5"; else echo "FAIL add 2 3: expected 5, got $got"; exit 1; fi\n',
    },
    request:
      "The tests in this project fail (run ./test.sh). Fix the bug so they pass. Then have the tester add a test for negative numbers in a new file test_negative.sh, and have the reviewer review the final change. Tell me what happened.",
  },
  bug: {
    files: {
      "calc.py": "def add(a, b):\n    return a - b\n",
      "test_calc.py":
        "from calc import add\n\nassert add(2, 3) == 5\nassert add(0, 0) == 0\nassert add(-1, 1) == 0\n",
      ...Object.fromEntries(
        ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"].map((name) => [
          `${name}.py`,
          `# ${name}: helpers that have nothing to do with the bug\n` +
            Array.from(
              { length: 12 },
              (_, i) => `def ${name}_${i}(x):\n    return x + ${i}\n`
            ).join("\n"),
        ])
      ),
    },
    request:
      "Running python3 test_calc.py fails. Find the bug and fix it so python3 test_calc.py exits with code 0. Then have the reviewer review the final change. Tell me what happened.",
  },
  build: {
    files: {
      "README.md": "A tiny bash toolbox. Scripts live in this folder.\n",
    },
    request:
      'Create slugify.sh: it takes one argument and prints it lowercased with spaces replaced by hyphens ("Hello World" -> "hello-world"). Have the tester write test_slugify.sh and run it, then have the reviewer review the result. Tell me what happened.',
  },
};
const chosen = SCENARIOS[scenario];
if (!chosen) throw new Error(`Unknown scenario "${scenario}"`);

const dir = createFixture(chosen.files);
for (const file of fs.readdirSync(dir)) {
  if (file.endsWith(".sh")) fs.chmodSync(path.join(dir, file), 0o755);
}
const runnable = (file: string) =>
  file.endsWith(".sh")
    ? ["bash", file]
    : file.endsWith(".py") && /^test/.test(file)
      ? ["python3", file]
      : null;
const evidence = path.resolve("tmp", `agent-team-${Date.now()}`);
fs.mkdirSync(evidence, { recursive: true });
const transcript = path.join(evidence, "transcript.log");
const log = {
  push: (text: string) => fs.appendFileSync(transcript, `${text}\n`),
};
const say = (line: string) => {
  log.push(line);
  console.log(line);
};

const runtime = new ModelRuntime();
runtime.setCustomModelsDir(modelsDir);
const team = new TeamRun();
const mcp = await startMCP(dir, { denyMutations: false });

const fileTools = mcp.rawTools.map((tool) => ({
  ...toToolDefinition(tool),
  inputSchema: tool.inputSchema,
}));
const terminal = runCommandTool();
const terminalTool = {
  ...toToolDefinition({ ...terminal, inputSchema: terminal.inputSchema }),
  serverName: "terminal",
} as ToolDefinition;
const workerTools = [...fileTools, terminalTool] as ToolDefinition[];
const family = detectModelFamily(model.name);

const sampling = { temperature: 0.5, maxTokens, topP: 0.9, topK: 40 };
let runningSession = 0;

const deps: AgentRunDeps = {
  openSession: async (prompt) => {
    runningSession += 1;
    return runtime.createAgentSession(prompt);
  },
  chat: async (sessionId, message) => {
    const reply = await runtime.agentChat(sessionId, message, sampling);
    log.push(`--- session ${sessionId} reply ---\n${reply}`);
    return reply;
  },
  contextOf: async (sessionId) => runtime.getAgentContext(sessionId),
  closeSession: async (sessionId) => runtime.closeAgentSession(sessionId),
  execute: async (call) => {
    if (isTerminalTool(call.tool)) return runCommand(call.arguments, dir);
    return mcp.execute("filesystem", call.tool, call.arguments);
  },
  buildPrompt: (spec) =>
    buildSystemPrompt({
      modelFamily: family,
      capabilities: [],
      customPrompt: spec.prompt,
      mcpEnabled: true,
      nativeTools: false,
      availableTools: [
        ...toolsForRole(spec.role, workerTools),
        TEAM_NOTE_TOOL as unknown as ToolDefinition,
      ],
      allowedPaths: [dir],
    }).prompt,
  workspaceFolder: dir,
  checkpointAt,
  onProgress: (line) => say(`  [progress] ${line}`),
};

const started = performance.now();
let finalAnswer = "";
try {
  await runtime.initialize();
  const loaded = await runtime.loadModel({ ...model, contextSize });
  if (loaded.memory) throw new Error(loaded.memory.problems.join(" "));

  const orchestratorTools = [
    { ...toToolDefinition({ ...DELEGATE_TOOL }), serverName: "agents" },
  ] as ToolDefinition[];
  await runtime.applySystemPrompt(
    buildSystemPrompt({
      modelFamily: family,
      capabilities: [],
      customPrompt: ORCHESTRATOR_PROMPT,
      mcpEnabled: true,
      nativeTools: false,
      availableTools: orchestratorTools,
      allowedPaths: [],
    }).prompt
  );
  runtime.clearHistory();

  say(`Project: ${dir}`);
  say(`Request: ${chosen.request}\n`);
  let reply = await runtime.chat(
    `${chosen.request}\n\n[Current folder: ${dir}]`,
    sampling
  );
  finalAnswer = reply;
  const orchestratorCalls: string[] = [];
  await processMCPToolCalls(
    { id: "o0", role: "assistant", content: reply, timestamp: new Date() },
    {
      onToolCallDetected: async (call) => {
        orchestratorCalls.push(
          `${call.tool} ${JSON.stringify(call.arguments).slice(0, 140)}`
        );
        say(
          `[orchestrator] ${call.tool} ${JSON.stringify(call.arguments).slice(0, 200)}`
        );
        if (call.tool === "delegate")
          return handleDelegate(call.arguments, team, deps);
        return {
          success: false,
          error: `${call.tool} is not available to you`,
        };
      },
      addMessage: () => {},
      continueConversation: async (text) => {
        reply = await runtime.chat(text, sampling);
        finalAnswer = reply;
        log.push(`--- orchestrator reply ---\n${reply}`);
        return reply;
      },
      maxToolRounds: 20,
      maxToolCallsPerTurn: 1,
      maxResultChars: 12000,
      workspaceFolder: dir,
    }
  );

  say(`\n===== Orchestrator's answer =====\n${finalAnswer}`);
  say(`\nTeam notes: ${JSON.stringify(team.getNotes())}`);

  // What really happened, checked here and not from anyone's report
  const files = fs.readdirSync(dir).sort();
  const results: Record<string, string> = {};
  for (const file of files.filter((f) => /test/.test(f) && runnable(f))) {
    const command = runnable(file)!;
    try {
      const output = execFileSync(
        command[0]!,
        [...command.slice(1), path.join(dir, file)],
        {
          encoding: "utf8",
          cwd: dir,
        }
      ).trim();
      results[file] = output || "exit 0";
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string };
      results[file] =
        `FAILED: ${`${failure.stdout ?? ""}${failure.stderr ?? ""}`.trim().slice(-300)}`;
    }
  }
  say(`\nFiles now: ${files.join(", ")}`);
  say(`Tests run by the harness: ${JSON.stringify(results, null, 2)}`);
  fs.writeFileSync(
    path.join(evidence, "result.json"),
    JSON.stringify(
      {
        scenario,
        model: model.id,
        contextSize,
        checkpointAt,
        seconds: (performance.now() - started) / 1000,
        sessionsOpened: runningSession,
        orchestratorCalls,
        finalAnswer,
        files,
        results,
        notes: team.getNotes(),
        fileContents: Object.fromEntries(
          files.map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")])
        ),
      },
      null,
      2
    )
  );
} finally {
  await mcp.close();
  await runtime.dispose();
  say(`Evidence: ${evidence}`);
}
