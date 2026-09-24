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
import { SseParser, type ChatStreamChunk } from "./llamaServer/sse.js";
import type {
  ChatMessage,
  ChatOptions,
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
    const child = spawn(binary, args, { windowsHide: true });
    this.process = child;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.systemPrompt = options.systemPrompt;
    this.history = [];
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

  private messages(extra?: ChatMessage) {
    return [
      { role: "system", content: this.systemPrompt },
      ...this.history,
      ...(extra ? [extra] : []),
    ];
  }

  async chat(message: string, options: ChatOptions = {}): Promise<string> {
    if (!this.isRunning()) {
      throw new Error("No model loaded. Call loadModel() first");
    }

    this.abortController = new AbortController();
    const signal = options.signal ?? this.abortController.signal;
    const userMessage: ChatMessage = { role: "user", content: message };
    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let reply = "";
    let final: ChatStreamChunk | null = null;

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          messages: this.messages(userMessage),
          stream: true,
          stream_options: { include_usage: true },
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

  setChatHistory(messages: ChatMessage[]): void {
    this.history = messages.filter((m) => m.role !== "system");
  }

  clearHistory(): void {
    this.history = [];
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
