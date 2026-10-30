/**
 * A SHIELD-managed llama-server (main process only)
 *
 * Runs models that need placement node-llama-cpp cannot do - for MoE models,
 * experts in system RAM with attention and the KV cache on the GPU. SHIELD
 * starts the server on a free localhost port, keeps the chat history itself
 * (the server is stateless per request) and streams replies over the
 * OpenAI-compatible API.
 */

import { execFileSync, spawn, type ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import {
  breakDownContext,
  type ContextBreakdown,
  type HistoryItem,
} from "./contextBreakdown.js";
import { cleanTitle, titleFromMessage } from "./titleGenerator.js";
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
import { RepetitionWatch } from "./llamaServer/repetition.js";
import {
  NativeCallWriter,
  openAiTools,
  type OpenAiTool,
  type ToolCallDelta,
} from "./llamaServer/nativeCalls.js";
import type { ToolDefinition } from "../types/prompts.js";
import {
  adaptRequestBody,
  checkPosture,
  completionsUrl,
  describeHttpError,
  requestHeaders,
  type GatewayPosture,
  type RemoteEndpoint,
} from "./remote/remoteEndpoint.js";
import {
  NUDGE_NOTE,
  type RequestStatus,
  type RescueAction,
} from "./llamaServer/rescue.js";
import {
  CLEAR_TO,
  COMPACT_AT,
  compactHistory,
  shouldCompact,
} from "./historyCompaction.js";
import {
  CAPSULE_SHARE,
  keepCharsFor,
  latestExchange,
  NOTE_MAX_TOKENS,
  noteRequest,
  renderCapsule,
  restoreHistory,
  summariseOldest,
  type Capsule,
  type SavedCapsule,
  type SavedMessage,
} from "./taskCapsule.js";
import type { ServerPlacement } from "../config/models.js";
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
  /** A fixed placement instead of `--fit` (catalog serverPlacement) */
  placement?: ServerPlacement;
  /** Sent as reasoning_effort when the reply thinks (catalog reasoningEffort) */
  reasoningEffort?: string;
}

/**
 * No progress from the server for this long means it has hung: the stream
 * reports each token, and the prompt as it is read. Bytes alone are not
 * progress: a hung Bonsai 27B server (main thread at 100%, 1,971 tokens
 * decoded and no more) still sent a few bytes now and then, which kept a
 * byte-based timer from ever firing. An earlier hang sat 45 minutes with
 * the whole team run waiting on it (2026-10-21).
 */
export const STALL_MS = 5 * 60 * 1000;

/**
 * The fewest tokens a chat reply gets, whatever Max Tokens says. Bonsai
 * 27B's thought counts against the limit: at the default 2,048 it thought
 * until the limit and wrote no answer, or was cut off partway through a
 * write_file and failed the same call three times (2026-10-27). Without
 * thinking too: sent again with thinking off (its thought went in circles),
 * a 9.6k-character write_file stopped at exactly 2,048 tokens (2026-10-28).
 * A ceiling, not a target: a short answer still ends when it is done.
 */
export const MIN_REPLY_TOKENS = 8192;

/** max_tokens for a chat request: the setting, raised to MIN_REPLY_TOKENS */
export function replyTokenLimit(maxTokens: number | undefined): number {
  return Math.max(maxTokens ?? 512, MIN_REPLY_TOKENS);
}

/**
 * How much of the window the next request starts from: this prompt plus
 * the reply as it stays in the history. Thought is in completion_tokens
 * but is not sent back, and counted it made a thinking reply look up to
 * 20% of the window larger than it was: Bonsai 2 27B at 24k cleared on
 * consecutive rounds, each clearing a 10k-token re-read (2026-10-29).
 * The visible reply is estimated at ~3 characters per token.
 */
export function nextPromptTokens(
  usage: { prompt_tokens: number; completion_tokens: number },
  reply: string
): number {
  return (
    usage.prompt_tokens +
    Math.min(usage.completion_tokens, Math.ceil(reply.length / 3))
  );
}

/**
 * SHIELD_SERVER_LOG=<file>: llama-server's output and SHIELD's notes on its
 * requests, timestamped and appended there. Off by default; for finding the
 * hang, whose server output was otherwise only an in-memory tail.
 */
function appendServerLog(line: string): void {
  const file = process.env.SHIELD_SERVER_LOG;
  if (!file) return;
  try {
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // A diagnostic only: never fail a reply over it
  }
}

/**
 * For the server log when a request stalls: the exact request, so it can be
 * sent again to a fresh server (with speculation on and off), and what each
 * llama-server thread is doing. The 2026-10-21 hangs spun one thread at
 * 100% CPU.
 */
function logStallDetails(requestBody: object): void {
  const file = process.env.SHIELD_SERVER_LOG;
  if (!file) return;
  const saved = `${file}.stall-${Date.now()}.json`;
  try {
    fs.writeFileSync(saved, JSON.stringify(requestBody, null, 1));
    appendServerLog(`[SHIELD] the stalled request was saved to ${saved}`);
  } catch {
    // A diagnostic only
  }
  if (process.platform === "win32") return;
  try {
    const threads = execFileSync(
      "ps",
      ["-C", "llama-server", "-L", "-o", "pid,tid,pcpu,stat,wchan:24"],
      { encoding: "utf8", timeout: 3000 }
    );
    appendServerLog(`[SHIELD] llama-server threads:\n${threads.trimEnd()}`);
  } catch (error) {
    appendServerLog(
      `[SHIELD] llama-server threads unreadable (${(error as Error).message})`
    );
  }
}

export class LlamaServerProvider {
  private process: ChildProcess | null = null;
  /**
   * Set when this provider talks to a hosted model rather than a server of
   * its own: the chat, summaries and stall handling are the same, the
   * requests go to the provider (remote/remoteEndpoint.ts).
   */
  private remote: RemoteEndpoint | null = null;
  /** The hosted model this session talks to; a fork's is its parent's */
  private get endpoint(): RemoteEndpoint | null {
    return this.parent ? this.parent.endpoint : this.remote;
  }
  /** How the provider said the last request was served (hosted models only) */
  private lastServedBy: GatewayPosture | null = null;
  private ownBaseUrl = "";
  /** A forked session follows its parent's server, also across a restart */
  private get baseUrl(): string {
    return this.parent ? this.parent.baseUrl : this.ownBaseUrl;
  }
  private set baseUrl(url: string) {
    this.ownBaseUrl = url;
  }
  /** What the server was started with, to start it again (restartServer) */
  private loadOptions: ServerLoadOptions | null = null;
  private restarting: Promise<void> | null = null;
  /**
   * The request in progress on this server, of whichever session: the server
   * has one slot, so there is at most one (rescue.ts). On the root only.
   */
  private inFlight: {
    session: LlamaServerProvider;
    startedAt: number;
    lastProgressAt: number;
    phase: RequestStatus["phase"];
  } | null = null;
  /** Set by rescue() on the session whose request it cut off */
  private rescueAction: RescueAction | null = null;
  private rescueController: AbortController | null = null;
  private contextSize = 0;
  /** reasoning_effort for replies that think (ServerLoadOptions) */
  private reasoningEffort: string | undefined;
  /**
   * Tools sent as native function definitions, for a model whose catalog
   * sets nativeToolCalls (llamaServer/nativeCalls.ts); empty otherwise.
   * Not passed to forked sessions: agents keep the text form for now.
   */
  private nativeTools: OpenAiTool[] = [];
  private toolServers = new Map<string, string>();
  private trainContextSize = 0;
  private systemPrompt = "You are a helpful AI assistant.";
  private history: ChatMessage[] = [];
  /** What the turns summarised out of the history held (taskCapsule) */
  private capsule: Capsule | null = null;
  /** Model-history entries represented by the current capsule, across cuts */
  private capsuleReplacedEntries = 0;
  /**
   * The capsule a restored chat saved and its exact model history; used
   * instead of writing another summary of the same turns.
   */
  private savedCapsule: {
    capsule: Capsule;
    modelHistory: ChatMessage[];
    start: number;
    replacedEntries: number;
  } | null = null;
  /** The capsule as the last request left it, if it wrote one; for the chat */
  private lastSummary: string | null = null;
  /** The same capsule for the chat to save and restore from */
  private lastCapsule: SavedCapsule | null = null;
  /** Prompt + reply tokens of the last request: how full the window is */
  private lastContextTokens = 0;
  private abortController: AbortController | null = null;
  private lastStats: GenerationStats | null = null;
  private logTail: string[] = [];
  private pidFile: string | undefined;
  /** Set on a session forked from a running server; it never owns the process */
  private parent: LlamaServerProvider | null = null;
  /**
   * A sub-agent's session never clears or summarises its history: that is
   * lossy, and it keeps the window under the checkpoint where the agent
   * would hand its work over instead. The agent checkpoints before the
   * window fills (src/agents).
   */
  private keepWholeHistory = false;

  isRunning(): boolean {
    if (this.parent) return this.parent.isRunning();
    if (this.remote) return true;
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * A chat of its own on this server: its own system prompt, history and
   * summaries, the same process and window. Sub-agents each work in one, so
   * a coder's reading never fills the orchestrator's context. The server has
   * one slot, so requests of different sessions take turns, and a session
   * that comes back re-reads its prompt. A session cannot start or stop the
   * server.
   */
  fork(
    systemPrompt: string,
    options: { keepWholeHistory?: boolean } = {}
  ): LlamaServerProvider {
    if (!this.isRunning()) {
      throw new Error("No model loaded. Call loadModel() first");
    }
    const session = new LlamaServerProvider();
    session.parent = this;
    session.contextSize = this.contextSize;
    session.trainContextSize = this.trainContextSize;
    session.reasoningEffort = this.reasoningEffort;
    session.systemPrompt = systemPrompt;
    session.keepWholeHistory = options.keepWholeHistory ?? false;
    return session;
  }

  /**
   * Tokens the last request used (prompt and reply, as the server counted
   * them) against the window. Free, unlike getContextUsage, which asks the
   * server to render and tokenise the chat.
   */
  getMeasuredContext(): { used: number; size: number } {
    return { used: this.lastContextTokens, size: this.contextSize };
  }

  getContextSize(): number {
    return this.contextSize;
  }

  /**
   * Start the server for a model; resolves once it answers /health.
   * Stops any server this provider already runs.
   */
  async load(options: ServerLoadOptions): Promise<void> {
    if (this.parent) throw new Error("A forked session cannot start a server");
    await this.stop();

    const binary = findLlamaServer();
    if (!binary) {
      throw new Error(
        `${process.platform === "win32" ? "llama-server.exe" : "llama-server"} was not found. ` +
          "Set SHIELD_LLAMA_SERVER to its path (a llama.cpp build with --fit and --n-cpu-moe)."
      );
    }

    this.systemPrompt = options.systemPrompt;
    this.reasoningEffort = options.reasoningEffort;
    this.history = [];
    this.capsule = null;
    this.capsuleReplacedEntries = 0;
    this.savedCapsule = null;
    this.loadOptions = options;
    await this.start(binary, options);
  }

  /**
   * Use a hosted model instead of starting a server. Nothing runs on this
   * machine; the window is the model's, and the chat is managed against it
   * as it is for a local server.
   */
  async attach(endpoint: RemoteEndpoint, systemPrompt: string): Promise<void> {
    if (this.parent) throw new Error("A forked session cannot attach");
    await this.stop();

    this.remote = endpoint;
    this.loadOptions = null;
    this.contextSize = endpoint.contextSize;
    this.trainContextSize = endpoint.contextSize;
    this.systemPrompt = systemPrompt;
    this.history = [];
    this.capsule = null;
    this.capsuleReplacedEntries = 0;
    this.savedCapsule = null;
    this.lastServedBy = null;
    console.log(
      `[Remote] Using ${endpoint.model} on ${endpoint.providerName}, ` +
        `context ${endpoint.contextSize}` +
        (endpoint.requireZdr ? ", zero data retention required" : "")
    );
  }

  /** Spawn the server and wait until it answers; the chat is left as it is */
  private async start(
    binary: string,
    options: ServerLoadOptions
  ): Promise<void> {
    const port = await freePort();
    const args = buildServerArgs({
      modelPath: options.modelPath,
      contextSize: options.contextSize,
      port,
      threads: defaultThreads(),
      specType: process.env.SHIELD_SPEC_TYPE === "none" ? "none" : "ngram-mod",
      placement: options.placement,
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
    this.pidFile = options.pidFile;
    if (this.pidFile && child.pid) {
      fs.writeFileSync(this.pidFile, String(child.pid));
    }

    const record = (data: Buffer) => {
      for (const line of data.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        appendServerLog(line);
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
    if (this.parent) return;
    this.remote = null;
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
    if (this.parent) return;
    if (this.process && this.process.exitCode === null) this.process.kill();
    if (this.pidFile) fs.rmSync(this.pidFile, { force: true });
  }

  /**
   * Kill the server and start it again on the same model, keeping every
   * session's chat: for a server that froze mid-reply (rescue.ts). A second
   * caller waits for the restart already under way.
   */
  async restartServer(): Promise<void> {
    if (this.parent) return this.parent.restartServer();
    // A hosted model has no process to restart: the message is sent again
    if (this.remote) return;
    if (this.restarting) return this.restarting;
    const options = this.loadOptions;
    const binary = findLlamaServer();
    if (!options || !binary) {
      throw new Error("No model loaded. Call loadModel() first");
    }
    this.restarting = (async () => {
      console.log("[LlamaServer] Restarting the server");
      appendServerLog("[SHIELD] restarting llama-server");
      const child = this.process;
      this.process = null;
      if (child && child.exitCode === null) {
        await new Promise<void>((resolve) => {
          // A frozen decode loop may never act on SIGTERM
          const force = setTimeout(() => child.kill("SIGKILL"), 3000);
          child.once("exit", () => {
            clearTimeout(force);
            resolve();
          });
          child.kill();
        });
      }
      await this.start(binary, options);
    })().finally(() => {
      this.restarting = null;
    });
    return this.restarting;
  }

  /**
   * Cut off the request in progress, of whichever session, and handle it as
   * the user chose (rescue.ts). False when nothing is running.
   */
  rescue(action: RescueAction): boolean {
    const session = (this.parent ?? this).inFlight?.session;
    if (!session?.rescueController) return false;
    // Skip ends an agent's step. The bar offered it for an agent's request;
    // by the click the orchestrator's may be the one running
    if (action === "skip" && !session.parent) return false;
    session.rescueAction = action;
    session.rescueController.abort();
    return true;
  }

  /** The request in progress on this server, for the stuck bar */
  requestStatus(): RequestStatus | null {
    const flight = (this.parent ?? this).inFlight;
    if (!flight) return null;
    const now = Date.now();
    return {
      agent: flight.session.parent !== null,
      phase: flight.phase,
      elapsedMs: now - flight.startedAt,
      idleMs: now - flight.lastProgressAt,
    };
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

  /** Where chat completions go: this server, or the hosted provider */
  private chatUrl(): string {
    const endpoint = this.endpoint;
    return endpoint
      ? completionsUrl(endpoint)
      : `${this.baseUrl}/v1/chat/completions`;
  }

  private chatHeaders(): Record<string, string> {
    const endpoint = this.endpoint;
    return endpoint
      ? requestHeaders(endpoint)
      : { "Content-Type": "application/json" };
  }

  /** A request written for llama-server, as the endpoint takes it */
  private shape(body: Record<string, unknown>): Record<string, unknown> {
    const endpoint = this.endpoint;
    return endpoint ? adaptRequestBody(body, endpoint) : body;
  }

  /** What to call the thing that serves the chat, in an error */
  private serverName(): string {
    return this.endpoint?.providerName ?? "llama-server";
  }

  private httpError(status: number, text: string): string {
    const endpoint = this.endpoint;
    return endpoint
      ? describeHttpError(endpoint.providerName, status, text)
      : `llama-server: HTTP ${status} ${text}`;
  }

  /**
   * One chat completion that is not streamed (a summary, a title), sent the
   * way the chat's own requests are: to a hosted provider it carries the key
   * and the zero-retention demand, and is dropped unless that is confirmed.
   */
  private async completion(
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<{ choices?: { message?: { content?: string } }[] }> {
    const response = await fetch(this.chatUrl(), {
      method: "POST",
      headers: this.chatHeaders(),
      signal,
      body: JSON.stringify(this.shape(body)),
    });
    if (!response.ok) {
      throw new Error(this.httpError(response.status, await response.text()));
    }
    const endpoint = this.endpoint;
    if (endpoint) checkPosture(endpoint, response.headers);
    return (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
  }

  /** How the provider said the last request was served; null for a local server */
  getLastServedBy(): GatewayPosture | null {
    return this.lastServedBy;
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

  /** `restarts`: times the server was restarted after a stall during this message */
  async chat(
    message: string,
    options: ChatOptions = {},
    restarts = 0
  ): Promise<string> {
    if (!this.isRunning()) {
      throw new Error("No model loaded. Call loadModel() first");
    }

    this.abortController = new AbortController();
    const signal = options.signal ?? this.abortController.signal;
    const root = this.parent ?? this;
    this.rescueAction = null;
    const rescued = new AbortController();
    this.rescueController = rescued;
    const flight = {
      session: this as LlamaServerProvider,
      startedAt: Date.now(),
      lastProgressAt: Date.now(),
      phase: "reading" as RequestStatus["phase"],
    };
    root.inFlight = flight;
    this.lastSummary = null;
    this.lastCapsule = null;
    const userMessage: ChatMessage = { role: "user", content: message };
    const startedAt = performance.now();
    const stalled = new AbortController();
    // Thought going round in circles: dropped, and the message sent again
    // without thinking (repetition.ts)
    const looping = new AbortController();
    const thoughtWatch = new RepetitionWatch();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const watchForStall = () => {
      flight.lastProgressAt = Date.now();
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => stalled.abort(), STALL_MS);
    };
    /**
     * The most prompt read and tokens written so far, kept apart: one mark
     * for both was set to the prompt's size by the read, and a thinking
     * reply's count stayed under it, so a server writing 22 tok/s was
     * called stalled 5 minutes after the read (2026-10-26)
     */
    let furthestRead = 0;
    let furthestWritten = 0;
    let firstTokenAt: number | null = null;
    let reply = "";
    let final: ChatStreamChunk | null = null;
    /** The whole prompt, once the server says how long it is */
    let promptTokens = 0;
    let retryWithoutThinking = false;
    let restartAfterStall = false;
    let rescue: RescueAction | null = null;
    /** What was sent, kept for the server log when it stalls */
    let requestBody: Record<string, unknown> = {};

    try {
      // Inside the try: Stop while summarising ends the turn like Stop
      // while replying
      await this.makeRoom(
        message,
        AbortSignal.any([signal, rescued.signal]),
        (progress) => {
          if (progress.phase === "summarising") flight.phase = "summarising";
          options.onProgress?.(progress);
        }
      );
      flight.phase = "reading";

      watchForStall();
      appendServerLog(
        `[SHIELD] chat request, thinking ${options.thinking === false ? "off" : "on"}`
      );
      requestBody = this.shape({
        messages: this.messages(userMessage),
        stream: true,
        stream_options: { include_usage: true },
        // Live progress: reading once per batch, then a count per token
        // that includes thinking, which is not streamed as content
        return_progress: true,
        timings_per_token: true,
        cache_prompt: true,
        temperature: options.temperature ?? 0.7,
        // The local minimum only: a hosted model is billed per token
        max_tokens: this.endpoint
          ? (options.maxTokens ?? 512)
          : replyTokenLimit(options.maxTokens),
        top_p: options.topP ?? 0.9,
        top_k: options.topK ?? 40,
        repeat_penalty: options.repeatPenalty ?? 1.1,
        ...(this.nativeTools.length > 0 ? { tools: this.nativeTools } : {}),
        ...(options.thinking === false
          ? { chat_template_kwargs: { enable_thinking: false } }
          : this.reasoningEffort
            ? { reasoning_effort: this.reasoningEffort }
            : {}),
      });
      const response = await fetch(this.chatUrl(), {
        method: "POST",
        headers: this.chatHeaders(),
        signal: AbortSignal.any([
          signal,
          stalled.signal,
          looping.signal,
          rescued.signal,
        ]),
        body: JSON.stringify(requestBody),
      });
      if (!response.ok || !response.body) {
        throw new Error(this.httpError(response.status, await response.text()));
      }
      // A hosted provider says how it served the request, before the reply:
      // when zero data retention is required and it did not, stop here and
      // keep nothing of what it would have said
      const endpoint = this.endpoint;
      if (endpoint) {
        try {
          this.lastServedBy = checkPosture(endpoint, response.headers);
        } catch (error) {
          await response.body.cancel().catch(() => undefined);
          throw error;
        }
      }

      const parser = new SseParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      const calls = new NativeCallWriter(
        (tool) => this.toolServers.get(tool) ?? "filesystem"
      );
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const chunk of parser.push(
          decoder.decode(value, { stream: true })
        )) {
          const thought = chunk.choices?.[0]?.delta?.reasoning_content;
          if (thought && thoughtWatch.push(thought)) looping.abort();
          const deltas = (
            chunk.choices?.[0]?.delta as { tool_calls?: ToolCallDelta[] }
          )?.tool_calls;
          const text =
            (chunk.choices?.[0]?.delta?.content ?? "") +
            (deltas ? calls.push(deltas) : "");
          if (text) {
            firstTokenAt ??= performance.now();
            reply += text;
            options.onToken?.(text);
          }
          const progress = chunkProgress(chunk, promptTokens);
          const advanced =
            progress?.phase === "reading"
              ? progress.done > furthestRead
              : progress?.phase === "writing" &&
                progress.generated > furthestWritten;
          if (text || thought || progress?.phase === "writing") {
            flight.phase = "writing";
          }
          if (progress?.phase === "reading") {
            furthestRead = Math.max(furthestRead, progress.done);
          } else if (progress?.phase === "writing") {
            furthestWritten = Math.max(furthestWritten, progress.generated);
          }
          if (text || thought || advanced) watchForStall();
          if (progress?.phase === "reading") promptTokens = progress.total;
          if (progress) options.onProgress?.(progress);
          if (chunk.timings || chunk.usage)
            final = { ...(final ?? {}), ...chunk };
        }
      }
      const closing = calls.finish();
      if (closing) {
        reply += closing;
        options.onToken?.(closing);
      }
    } catch (error) {
      if (rescued.signal.aborted && !signal.aborted) {
        console.log(
          `[LlamaServer] Request cut off by the user: ${this.rescueAction}`
        );
        appendServerLog(
          `[SHIELD] request cut off by the user: ${this.rescueAction}`
        );
        rescue = this.rescueAction;
      } else if (looping.signal.aborted && !signal.aborted) {
        console.log(
          "[LlamaServer] The model's thinking repeated itself; sending the message again without thinking"
        );
        appendServerLog(
          "[SHIELD] thinking repeated itself: request aborted, sending it again without thinking"
        );
        retryWithoutThinking = true;
      }
      // Stopped by the user: keep what was generated, like LlamaChatSession
      else if (stalled.signal.aborted && !signal.aborted) {
        // Never for a hosted model: the stalled request is the user's
        // messages, and there is no local server to look at
        if (process.env.SHIELD_SERVER_LOG && !this.endpoint) {
          appendServerLog(
            `[SHIELD] no progress for ${STALL_MS / 60000} minutes: request given up. /slots: ${await fetch(
              `${this.baseUrl}/slots`,
              { signal: AbortSignal.timeout(3000) }
            )
              .then((r) => r.text())
              .catch((e: Error) => `unreadable (${e.message})`)}`
          );
          logStallDetails(requestBody);
        }
        // Once: a server that freezes again on the same message is not
        // helped by a third try
        if (restarts > 0) {
          throw new Error(
            this.endpoint
              ? `${this.serverName()} made no progress for ${STALL_MS / 60000} minutes, also on a second try, and was given up on.`
              : `llama-server made no progress for ${STALL_MS / 60000} minutes, also after a restart, and was given up on. Stop and reload the model.`
          );
        }
        restartAfterStall = true;
      } else if (!signal.aborted) throw error;
    } finally {
      clearTimeout(stallTimer);
      this.abortController = null;
      this.rescueController = null;
      if (root.inFlight === flight) root.inFlight = null;
    }
    // Nothing of a dropped reply is kept: the history is as it was
    if (rescue === "nudge") {
      const nudged = message.endsWith(NUDGE_NOTE)
        ? message
        : message + NUDGE_NOTE;
      return this.chat(nudged, { ...options, thinking: false }, restarts);
    }
    if (rescue === "restart" || restartAfterStall) {
      await this.restartServer();
      return this.chat(
        message,
        options,
        restarts + (restartAfterStall ? 1 : 0)
      );
    }
    // "skip" goes on like Stop: what was written is kept
    if (retryWithoutThinking) {
      return this.chat(message, { ...options, thinking: false }, restarts);
    }

    this.history.push(userMessage, { role: "assistant", content: reply });
    if (final?.usage) {
      this.lastContextTokens = nextPromptTokens(final.usage, reply);
    }

    const endedAt = performance.now();
    const outputTokens =
      final?.timings?.predicted_n ?? final?.usage?.completion_tokens ?? 0;
    const hostedBy = this.endpoint ? this.lastServedBy : null;
    this.lastStats = {
      outputTokens,
      tokensPerSecond:
        final?.timings?.predicted_per_second ??
        // A hosted model's count includes thinking the stream never shows,
        // so timing from the first visible word would overstate its speed:
        // over the whole reply it is the speed the user actually got
        outputTokens /
          Math.max(
            (endedAt -
              (this.endpoint ? startedAt : (firstTokenAt ?? startedAt))) /
              1000,
            1e-3
          ),
      durationMs: endedAt - startedAt,
      ...(hostedBy
        ? { servedBy: { provider: hostedBy.provider, zdr: hostedBy.zdr } }
        : {}),
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

  /** The same capsule as the chat saves it, to restore from */
  getLastCapsule(): SavedCapsule | null {
    return this.lastCapsule;
  }

  setChatHistory(messages: SavedMessage[]): void {
    // Only what the model reads: the chat's messages also carry ids, stats
    // and tool metadata, which went to the server with every request
    const { history, saved } = restoreHistory(messages);
    this.history = history;
    this.capsule = null;
    this.capsuleReplacedEntries = 0;
    this.savedCapsule = saved;
    this.lastContextTokens = this.estimateTokens();
    // The chat whole if it fits, else as it was left: a restored chat that
    // needed a summary would otherwise write it again before the next
    // message, 5-15 s of reading and writing
    this.makeRoomCheaply(0);
  }

  clearHistory(): void {
    this.history = [];
    this.capsule = null;
    this.capsuleReplacedEntries = 0;
    this.savedCapsule = null;
    this.lastContextTokens = 0;
  }

  /**
   * Make room before a request that would fill most of the window
   * (COMPACT_AT), in the cheapest way that is enough:
   * 1. clear old tool payloads, oldest first, keeping the last few
   *    exchanges whole (historyCompaction);
   * 2. clear the last few too, all but the latest exchange - still no model
   *    call, and what large tool results need: at 8K, going straight to
   *    step 4 summarised every tool round, 4-7 s each (2026-09-25).
   *    Steps 1-2 go on to CLEAR_TO once they start;
   * 3. in a restored chat, go back to the capsule it saved;
   * 4. replace the oldest turns with a capsule (taskCapsule).
   * The prompt cache is reused only up to the first changed message, so
   * each costs a slower read of the shortened history - which is why none
   * runs until needed.
   */
  private async makeRoom(
    nextMessage: string,
    signal: AbortSignal,
    onProgress?: (progress: ChatProgress) => void
  ): Promise<void> {
    if (this.makeRoomCheaply(nextMessage.length)) return;

    onProgress?.({ phase: "summarising" });
    const summarised = await summariseOldest(
      this.history,
      this.capsule,
      keepCharsFor(this.contextSize, this.systemPrompt.length, CLEAR_TO),
      (older) => this.writeNote(older, nextMessage, signal)
    );
    if (!summarised) return;

    const removed = this.history.length - summarised.history.length;
    this.history = summarised.history;
    this.capsule = summarised.capsule;
    this.capsuleReplacedEntries += removed;
    this.lastSummary = this.capsuleText();
    this.lastCapsule = {
      ...summarised.capsule,
      modelHistory: summarised.history.map(({ role, content }) => ({
        role,
        content,
      })),
      replacedEntries: this.capsuleReplacedEntries,
    };
    this.lastContextTokens = this.estimateTokens();
    console.log(
      `[LlamaServer] Summarised ${removed} older messages into a capsule of ${this.lastSummary.length} characters`
    );
  }

  /**
   * Steps 1-3 of makeRoom, which need no model call. True once the history
   * leaves room for a message of `nextMessageChars`.
   */
  private makeRoomCheaply(nextMessageChars: number): boolean {
    if (this.keepWholeHistory) return true;
    const under = (limit: number) =>
      !shouldCompact(
        this.lastContextTokens,
        nextMessageChars,
        this.contextSize,
        limit
      );
    if (under(COMPACT_AT)) return true;

    // Oldest exchanges first, one at a time, down to CLEAR_TO so that the
    // next file read does not clear again. The last few exchanges are what
    // the model is working from right now: they go only if the older ones
    // were not enough, and the latest one never does
    const latest = this.history.length - latestExchange(this.history);
    for (let keep = Math.max(6, latest); ; keep = Math.max(keep - 2, latest)) {
      this.clearPayloads(keep);
      if (under(CLEAR_TO) || keep === latest) break;
    }
    if (under(COMPACT_AT)) return true;
    return this.useSavedCapsule() && under(COMPACT_AT);
  }

  /**
   * Go back to the capsule a restored chat saved: the turns it replaced
   * leave the history again, with no new note to write. False when there
   * is none.
   */
  private useSavedCapsule(): boolean {
    const saved = this.savedCapsule;
    if (!saved) return false;
    this.savedCapsule = null;
    this.history = [...saved.modelHistory, ...this.history.slice(saved.start)];
    this.capsule = saved.capsule;
    this.capsuleReplacedEntries = saved.replacedEntries;
    this.lastContextTokens = this.estimateTokens();
    console.log(
      `[LlamaServer] Went back to the chat's saved summary of ${saved.replacedEntries} older model messages`
    );
    return true;
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
    const result = await this.completion(
      {
        messages: [
          { role: "system", content: this.systemContent() },
          ...older,
          { role: "user", content: noteRequest(nextMessage) },
        ],
        cache_prompt: true,
        temperature: 0.2,
        max_tokens: NOTE_MAX_TOKENS,
      },
      signal
    );
    return result.choices?.[0]?.message?.content ?? "";
  }

  applySystemPrompt(prompt: string, tools: ToolDefinition[] = []): void {
    this.systemPrompt = prompt;
    this.nativeTools = openAiTools(tools);
    this.toolServers = new Map(
      tools.map((tool) => [tool.name, tool.serverName ?? "filesystem"])
    );
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

    // A hosted model has no tokenizer to ask and no chat template to render:
    // the provider's count of the last request stands for the whole chat, the
    // parts are estimated at about three characters a token
    if (this.endpoint) {
      return breakDownContext(history, (text) => Math.ceil(text.length / 3), {
        rendered: this.lastContextTokens || Math.ceil(this.estimateTokens()),
        size: this.contextSize,
        trainContextSize: this.trainContextSize,
      });
    }

    // Some templates refuse a chat without a user message (Bonsai's, built on
    // Qwen3.5's, raises "No user query found"), which is what a new chat is.
    // The pieces counted below stand in for the rendered total then.
    let prompt = "";
    try {
      ({ prompt } = (await this.post("/apply-template", {
        messages: this.messages(),
      })) as { prompt: string });
    } catch (error) {
      console.warn(
        "[LlamaServer] Chat template could not render the chat; counting its parts:",
        error instanceof Error ? error.message.slice(0, 120) : error
      );
    }

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
    const hosted = !!this.endpoint;
    const result = await this.completion({
      messages: [
        {
          role: "user",
          content: `Based on this user message, generate a short, concise title (max 6 words) that describes the topic or question. Only return the title, nothing else.\n\nUser message: "${userMessage}"`,
        },
      ],
      temperature: 0.3,
      // A hosted thinking model cannot be switched off through the standard
      // fields, so its thought counts against this limit: room for some
      max_tokens: hosted ? 400 : 20,
      cache_prompt: false,
      // A thinking model spends all 20 tokens on thought and returns an empty
      // title; templates without the switch ignore it
      chat_template_kwargs: { enable_thinking: false },
    });
    const title = result.choices?.[0]?.message?.content ?? "";
    if (hosted && !title.trim()) {
      console.log(
        "[Remote] The title request came back empty (a thinking model may have used its whole budget thinking); titling the chat from the message instead"
      );
      return titleFromMessage(userMessage);
    }
    return cleanTitle(title);
  }
}
