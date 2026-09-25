/**
 * A SHIELD-managed llama-server (main process only)
 *
 * Runs models that need placement node-llama-cpp cannot do - for MoE models,
 * experts in system RAM with attention and the KV cache on the GPU. SHIELD
 * starts the server on a free localhost port, keeps the chat history itself
 * (the server is stateless per request) and streams replies over the
 * OpenAI-compatible API.
 */

import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import {
  breakDownContext,
  type ContextBreakdown,
  type HistoryItem,
} from "./contextBreakdown.js";
import { cleanTitle } from "./titleGenerator.js";
import {
  buildServerArgs,
  defaultThreads,
  findLlamaServer,
} from "./llamaServer/launch.js";
import {
  chunkProgress,
  SseParser,
  type ChatStreamChunk,
} from "./llamaServer/sse.js";
import { compactHistory, shouldCompact } from "./historyCompaction.js";
import {
  CAPSULE_SHARE,
  KEEP_SHARE,
  latestExchange,
  NOTE_MAX_TOKENS,
  noteRequest,
  renderCapsule,
  summariseOldest,
  type Capsule,
} from "./taskCapsule.js";
import type {
  ChatMessage,
  ChatOptions,
  ChatProgress,
  ContextUsage,
  GenerationStats,
} from "./LlamaService.js";

/** Loading a 17 GB model into RAM plus fitting takes ~20 s; allow for slow disks */
const STARTUP_TIMEOUT_MS = 5 * 60_000;
/** Recent server output, shown when it fails to start */
const LOG_TAIL_LINES = 40;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("No free port"))
      );
    });
  });
}

export interface ServerLoadOptions {
  modelPath: string;
  contextSize: number;
  systemPrompt: string;
  /** Where the server's PID is recorded, so a crash does not orphan it */
  pidFile?: string;
}

export class LlamaServerProvider {
  private process: ChildProcess | null = null;
  private baseUrl = "";
  private contextSize = 0;
  private trainContextSize = 0;
  private systemPrompt = "You are a helpful AI assistant.";
  private history: ChatMessage[] = [];
  /** What the turns summarised out of the history held (taskCapsule) */
  private capsule: Capsule | null = null;
  /** The capsule as the last request left it, if it wrote one; for the chat */
  private lastSummary: string | null = null;
  /** Prompt + reply tokens of the last request: how full the window is */
  private lastContextTokens = 0;
  private abortController: AbortController | null = null;
  private lastStats: GenerationStats | null = null;
  private logTail: string[] = [];
  private pidFile: string | undefined;

  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  getContextSize(): number {
    return this.contextSize;
  }

  /**
   * Start the server for a model; resolves once it answers /health.
   * Stops any server this provider already runs.
   */
  async load(options: ServerLoadOptions): Promise<void> {
    await this.stop();

    const binary = findLlamaServer();
    if (!binary) {
      throw new Error(
        "llama-server.exe was not found. Set SHIELD_LLAMA_SERVER to its path " +
          "(a llama.cpp build with --fit and --n-cpu-moe)."
      );
    }

    const port = await freePort();
    const args = buildServerArgs({
      modelPath: options.modelPath,
      contextSize: options.contextSize,
      port,
      threads: defaultThreads(),
    });
    console.log(`[LlamaServer] Starting ${binary} ${args.join(" ")}`);

    this.logTail = [];
    // Never `detached`: on Windows libuv puts attached children in a job
    // object that kills them when SHIELD's main process dies, even from a
    // crash or Task Manager (verified 2026-09-24). That is what keeps a
    // hard-killed SHIELD from leaving ~22 GB committed to an orphaned server.
    const child = spawn(binary, args, { windowsHide: true });
    this.process = child;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.systemPrompt = options.systemPrompt;
    this.history = [];
    this.capsule = null;
    this.pidFile = options.pidFile;
    if (this.pidFile && child.pid) {
      fs.writeFileSync(this.pidFile, String(child.pid));
    }

    const record = (data: Buffer) => {
      for (const line of data.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.logTail.push(line);
        if (this.logTail.length > LOG_TAIL_LINES) this.logTail.shift();
      }
    };
    child.stdout?.on("data", record);
    child.stderr?.on("data", record);

    try {
      await this.waitUntilReady(child);
    } catch (error) {
      await this.stop();
      throw error;
    }

    const props = (await this.get("/props")) as {
      default_generation_settings?: { n_ctx?: number };
    };
    this.contextSize =
      props.default_generation_settings?.n_ctx ?? options.contextSize;
    const models = (await this.get("/v1/models")) as {
      data?: { meta?: { n_ctx_train?: number } }[];
    };
    this.trainContextSize =
      models.data?.[0]?.meta?.n_ctx_train ?? this.contextSize;
    console.log(
      `[LlamaServer] Ready on port ${port}, context ${this.contextSize}`
    );
  }

  private async waitUntilReady(child: ChildProcess): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < STARTUP_TIMEOUT_MS) {
      if (child.exitCode !== null) {
        throw new Error(
          `llama-server exited during startup (code ${child.exitCode}):\n` +
            this.logTail.slice(-8).join("\n")
        );
      }
      try {
        const response = await fetch(`${this.baseUrl}/health`);
        if (response.ok) return;
      } catch {
        // Not listening yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("llama-server did not become ready in time");
  }

  /** Stop the server and free its VRAM and RAM */
  async stop(): Promise<void> {
    this.abortController?.abort();
    const child = this.process;
    this.process = null;
    this.contextSize = 0;
    if (!child || child.exitCode !== null) return;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
    if (this.pidFile) fs.rmSync(this.pidFile, { force: true });
    console.log("[LlamaServer] Stopped");
  }

  /** Synchronous last resort for process exit, when awaiting is impossible */
  killNow(): void {
    if (this.process && this.process.exitCode === null) this.process.kill();
    if (this.pidFile) fs.rmSync(this.pidFile, { force: true });
  }

  private async get(route: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${route}`);
    if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
    return response.json();
  }

  private async post(route: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        `${route}: HTTP ${response.status} ${await response.text()}`
      );
    }
    return response.json();
  }

  /** The capsule within its share of the window */
  private capsuleText(): string {
    return this.capsule
      ? renderCapsule(this.capsule, this.contextSize * CAPSULE_SHARE * 3)
      : "";
  }

  /**
   * The system prompt, then the capsule. The capsule goes in the system
   * message because a message of its own before the kept turns would
   * break the user/assistant alternation strict chat templates require.
   */
  private systemContent(): string {
    return this.capsule
      ? `${this.systemPrompt}\n\n${this.capsuleText()}`
      : this.systemPrompt;
  }

  private messages(extra?: ChatMessage) {
    return [
      { role: "system", content: this.systemContent() },
      ...this.history,
      ...(extra ? [extra] : []),
    ];
  }

  /** Before a request has measured it: ~3 characters per token */
  private estimateTokens(): number {
    return (
      (this.systemContent().length +
        this.history.reduce((n, m) => n + m.content.length, 0)) /
      3
    );
  }

  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    if (!this.isRunning()) {
      throw new Error("No model loaded. Call loadModel() first");
    }

    this.abortController = new AbortController();
    const signal = options.signal ?? this.abortController.signal;
    this.lastSummary = null;
    const userMessage: ChatMessage = { role: "user", content: message };
    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let reply = "";
    let final: ChatStreamChunk | null = null;
    /** The whole prompt, once the server says how long it is */
    let promptTokens = 0;

    try {
      // Inside the try: Stop while summarising ends the turn like Stop
      // while replying
      await this.makeRoom(message, signal, options.onProgress);

      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          messages: this.messages(userMessage),
          stream: true,
          stream_options: { include_usage: true },
          // Live progress: reading once per batch, then a count per token
          // that includes thinking, which is not streamed as content
          return_progress: true,
          timings_per_token: true,
          cache_prompt: true,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 512,
          top_p: options.topP ?? 0.9,
          top_k: options.topK ?? 40,
          repeat_penalty: options.repeatPenalty ?? 1.1,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(
          `llama-server: HTTP ${response.status} ${await response.text()}`
        );
      }

      const parser = new SseParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const chunk of parser.push(
          decoder.decode(value, { stream: true })
        )) {
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) {
            firstTokenAt ??= performance.now();
            reply += text;
            options.onToken?.(text);
          }
          const progress = chunkProgress(chunk, promptTokens);
          if (progress?.phase === "reading") promptTokens = progress.total;
          if (progress) options.onProgress?.(progress);
          if (chunk.timings || chunk.usage)
            final = { ...(final ?? {}), ...chunk };
        }
      }
    } catch (error) {
      // Stopped by the user: keep what was generated, like LlamaChatSession
      if (!signal.aborted) throw error;
    } finally {
      this.abortController = null;
    }

    this.history.push(userMessage, { role: "assistant", content: reply });
    if (final?.usage) {
      this.lastContextTokens =
        final.usage.prompt_tokens + final.usage.completion_tokens;
    }

    const endedAt = performance.now();
    const outputTokens =
      final?.timings?.predicted_n ?? final?.usage?.completion_tokens ?? 0;
    this.lastStats = {
      outputTokens,
      tokensPerSecond:
        final?.timings?.predicted_per_second ??
        outputTokens /
          Math.max((endedAt - (firstTokenAt ?? startedAt)) / 1000, 1e-3),
      durationMs: endedAt - startedAt,
    };
    const readingSeconds = ((firstTokenAt ?? endedAt) - startedAt) / 1000;
    console.log(
      `[LlamaServer] Inference complete: ${outputTokens} tokens, ` +
        `${this.lastStats.tokensPerSecond.toFixed(1)} tok/s, ` +
        `first token after ${readingSeconds.toFixed(1)}s, ` +
        `input ${final?.timings?.prompt_n ?? "?"} new tokens`
    );
    return reply;
  }

  stopGeneration(): void {
    this.abortController?.abort();
  }

  getLastStats(): GenerationStats | null {
    return this.lastStats;
  }

  /** The capsule, if the last request had to write one to make room */
  getLastSummary(): string | null {
    return this.lastSummary;
  }

  setChatHistory(messages: ChatMessage[]): void {
    // Only what the model reads: the chat's messages also carry ids, stats
    // and tool metadata, which went to the server with every request
    this.history = messages
      .filter((m) => m.role !== "system")
      .map(({ role, content }) => ({ role, content }));
    // A restored chat starts whole; it is compacted again if needed
    this.capsule = null;
    this.lastContextTokens = this.estimateTokens();
  }

  clearHistory(): void {
    this.history = [];
    this.capsule = null;
    this.lastContextTokens = 0;
  }

  /**
   * Make room before a request that would fill most of the window, in the
   * cheapest way that is enough:
   * 1. clear old tool payloads, keeping the last few exchanges whole
   *    (historyCompaction);
   * 2. clear them from all but the latest exchange - still no model call,
   *    and what large tool results need: at 8K, going straight to step 3
   *    summarised every tool round, 4-7 s each (2026-09-25);
   * 3. replace the oldest turns with a capsule (taskCapsule).
   * The prompt cache is reused only up to the first changed message, so
   * each costs a slower read of the shortened history - which is why none
   * runs until needed.
   */
  private async makeRoom(
    nextMessage: string,
    signal: AbortSignal,
    onProgress?: (progress: ChatProgress) => void
  ): Promise<void> {
    const tooFull = () =>
      shouldCompact(
        this.lastContextTokens,
        nextMessage.length,
        this.contextSize
      );
    if (!tooFull()) return;

    // The last few exchanges are what the model is working from right now
    this.clearPayloads(6);
    if (!tooFull()) return;
    this.clearPayloads(this.history.length - latestExchange(this.history));
    if (!tooFull()) return;

    onProgress?.({ phase: "summarising" });
    const summarised = await summariseOldest(
      this.history,
      this.capsule,
      this.contextSize * KEEP_SHARE * 3,
      (older) => this.writeNote(older, nextMessage, signal)
    );
    if (!summarised) return;

    const removed = this.history.length - summarised.history.length;
    this.history = summarised.history;
    this.capsule = summarised.capsule;
    this.lastSummary = this.capsuleText();
    this.lastContextTokens = this.estimateTokens();
    console.log(
      `[LlamaServer] Summarised ${removed} older messages into a capsule of ${this.lastSummary.length} characters`
    );
  }

  /** Clear old tool payloads, leaving the last `keepRecent` entries whole */
  private clearPayloads(keepRecent: number): void {
    const { history, savedChars } = compactHistory(this.history, keepRecent);
    if (savedChars === 0) return;
    this.history = history;
    this.lastContextTokens = Math.max(
      0,
      this.lastContextTokens - savedChars / 3
    );
    console.log(
      `[LlamaServer] Compacted history: cleared ${savedChars} characters of old tool calls and results`
    );
  }

  /**
   * The model's note on the turns about to be removed, told what comes
   * after it (`nextMessage`). Sent with the same system message and history
   * as the chat, so the server's prompt cache covers everything before the
   * first message clearing changed.
   */
  private async writeNote(
    older: ChatMessage[],
    nextMessage: string,
    signal: AbortSignal
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        messages: [
          { role: "system", content: this.systemContent() },
          ...older,
          { role: "user", content: noteRequest(nextMessage) },
        ],
        cache_prompt: true,
        temperature: 0.2,
        max_tokens: NOTE_MAX_TOKENS,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `llama-server: HTTP ${response.status} ${await response.text()}`
      );
    }
    const result = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return result.choices?.[0]?.message?.content ?? "";
  }

  applySystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  private async countTokens(texts: string[]): Promise<Map<string, number>> {
    const unique = [...new Set(texts.filter(Boolean))];
    const counts = await Promise.all(
      unique.map(async (content) => {
        const { tokens } = (await this.post("/tokenize", { content })) as {
          tokens: unknown[];
        };
        return [content, tokens.length] as const;
      })
    );
    return new Map(counts);
  }

  /**
   * What fills the context window, like LlamaService's. Token counts come
   * from the server: one pass collects the text pieces the breakdown needs,
   * they are tokenized, then a second pass reads the counts.
   */
  async getContextBreakdown(): Promise<ContextBreakdown | null> {
    if (!this.isRunning()) return null;

    const history: HistoryItem[] = [
      { type: "system", text: this.systemPrompt },
      // Sent in the system message, but it stands for earlier messages;
      // counted there it would read as tool instructions
      ...(this.capsule
        ? [{ type: "user", text: this.capsuleText() } as HistoryItem]
        : []),
      ...this.history.map((m): HistoryItem =>
        m.role === "user"
          ? { type: "user", text: m.content }
          : { type: "model", response: [m.content] }
      ),
    ];

    const { prompt } = (await this.post("/apply-template", {
      messages: this.messages(),
    })) as { prompt: string };

    const pieces: string[] = [prompt];
    const window = {
      rendered: 0,
      size: this.contextSize,
      trainContextSize: this.trainContextSize,
    };
    breakDownContext(history, (text) => (pieces.push(text), 0), window);
    const counts = await this.countTokens(pieces);

    return breakDownContext(history, (text) => counts.get(text) ?? 0, {
      ...window,
      rendered: counts.get(prompt) ?? 0,
    });
  }

  async getContextUsage(): Promise<ContextUsage | null> {
    const breakdown = await this.getContextBreakdown();
    return breakdown ? { used: breakdown.used, size: breakdown.size } : null;
  }

  /** A title from the first message, without touching the chat history */
  async generateTitle(userMessage: string): Promise<string> {
    const result = (await this.post("/v1/chat/completions", {
      messages: [
        {
          role: "user",
          content: `Based on this user message, generate a short, concise title (max 6 words) that describes the topic or question. Only return the title, nothing else.\n\nUser message: "${userMessage}"`,
        },
      ],
      temperature: 0.3,
      max_tokens: 20,
      cache_prompt: false,
    })) as { choices?: { message?: { content?: string } }[] };
    return cleanTitle(result.choices?.[0]?.message?.content ?? "");
  }
}
