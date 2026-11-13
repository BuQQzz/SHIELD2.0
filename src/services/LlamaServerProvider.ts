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
  serverEnv,
  defaultThreads,
  findLlamaServer,
} from "./llamaServer/launch.js";
import {
  chunkProgress,
  SseParser,
  type ChatStreamChunk,
} from "./llamaServer/sse.js";
import { RepetitionWatch } from "./llamaServer/repetition.js";
import { unswallowQwenCalls } from "../handlers/toolCallParsing.js";
import {
  NativeCallWriter,
  RESULT_FRAMING,
  openAiTools,
  type OpenAiTool,
  type ToolCallDelta,
} from "./llamaServer/nativeCalls.js";
import {
  nativeHistory,
  type WireMessage,
} from "./llamaServer/nativeHistory.js";
import { isToolResultTurn } from "./contextBreakdown.js";
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
  EMPTY_REPLY_NOTE,
  type RequestStatus,
  type RescueAction,
} from "./llamaServer/rescue.js";
import {
  CLEAR_TO,
  COMPACT_AT,
  compactHistory,
  compactStaleReads,
  stripRemovalNotes,
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
} from "./chatTypes.js";

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
  /** Most thinking tokens per reply (catalog reasoningBudget) */
  reasoningBudget?: number;
  /** Sent as presence_penalty with every request (catalog presencePenalty) */
  presencePenalty?: number;
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

/** What launch.ts adds to a thought cut at the budget, not the model's own */
const BUDGET_NOTE =
  /\s*Thinking budget reached\. Act now on what I have worked out\.\s*$/;

/**
 * Thinking sent back within one request, at most (~6K tokens of a 32K
 * window): two thoughts at Bonsai 2's 2,560-token budget (~10K characters
 * each). 12,000 held one, so every round started a new set
 */
export const THINKING_CHARS = 20_000;

/** A reply's thinking as it is kept: without the budget note, trimmed */
export function keptThinking(thinking: string): string {
  return thinking.replace(BUDGET_NOTE, "").trim();
}

/**
 * The turns with thinking kept only on replies since the user's latest
 * message (tool results do not count as one). Within a request the model
 * sees what it already worked out; Bonsai 2's template keeps it there
 * ("supports preserving reasoning"). Without it, in g24 step 16 the model
 * started over on what the user meant in each of ~10 rounds, each cut at
 * its 1,536-token budget, and the step timed out (2026-11-11). Older
 * requests' thinking is left out, as the template itself would.
 */
export function withRequestThinking(turns: ChatMessage[]): ChatMessage[] {
  let start = turns.length;
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i]!;
    if (turn.role === "user" && !isToolResultTurn(turn.content)) {
      start = i;
      break;
    }
  }
  if (start === turns.length) start = 0;
  // Up to THINKING_CHARS, kept in sets: the thoughts so far while they fit,
  // and when the next one does not, a new set from it. Ten rounds of ~1.5K
  // tokens would take half of a 32K window. Within a set what was sent stays
  // as it was, so the server's prompt cache holds; dropping the oldest each
  // round would make the server read the prompt again every round, so it
  // happens once a set fills. Keeping the oldest only (7be91de) held the
  // first six thoughts of g26 step 16 for its last 27 rounds, including a
  // first reading of "the monthly view" the model had moved past; it went
  // "back and forth" and timed out (2026-11-11)
  let keep = new Set<number>();
  let total = 0;
  for (let i = start + 1; i < turns.length; i++) {
    const thought = turns[i]!.reasoning;
    if (!thought) continue;
    // Nor the thought behind a call that failed: kept, its plan outweighed
    // the error. In kt-fix2 Bonsai 2 read a misspelled file name and sent
    // the same read three more times (2026-11-11)
    if (/<error>|already failed in this turn/.test(turns[i + 1]?.content ?? ""))
      continue;
    if (thought.length > THINKING_CHARS) continue;
    if (total + thought.length > THINKING_CHARS) {
      keep = new Set();
      total = 0;
    }
    total += thought.length;
    keep.add(i);
  }
  return turns.map((turn, i) => {
    if (!turn.reasoning || keep.has(i)) return turn;
    const { reasoning: _dropped, ...rest } = turn;
    return rest;
  });
}

/**
 * The note request: the chat's last prompt and reply as they were sent
 * (same system message, tools, native turns and thinking), then the note
 * request. The server then reads only the note request: its saved state
 * from the last reply covers the rest. Two things cost a full read before
 * (g32, all 5 notes, 8-12K tokens and 20-27 s each, 2026-11-11): the note
 * request was sent without the tools, so its prompt differed from the
 * start, and it was sent the history already cleared and cut to the older
 * turns. A matching prefix alone is not enough with Bonsai 2: the server
 * resumes only from a saved state (end of an earlier request), and the cut
 * between older and newer turns is not one; matched to the cut, it re-read
 * 3,450 of 3,823 tokens. The template's thinking-off prompt changes only
 * the end, where the reply starts, as long as the chat's reasoning effort
 * adds no line to the system message (medium, as Bonsai 2's catalog entry
 * sets; xhigh and low do). tool_choice "none": a note, not a tool call.
 */
export function noteBody(
  system: string,
  turns: ChatMessage[],
  nextMessage: string,
  tools: unknown[]
): { messages: unknown[]; tools?: unknown[]; tool_choice?: "none" } {
  const kept = withRequestThinking(turns);
  const wire = tools.length > 0 ? nativeHistory(kept) : kept;
  return {
    messages: [
      { role: "system", content: system },
      ...wire.map(asWire),
      { role: "user", content: noteRequest(nextMessage) },
    ],
    ...(tools.length > 0 ? { tools, tool_choice: "none" as const } : {}),
  };
}

/** A message as the server reads it: thinking as reasoning_content */
function asWire(
  message: WireMessage
):
  | WireMessage
  | (Omit<WireMessage, "reasoning"> & { reasoning_content: string }) {
  if (!("reasoning" in message) || !message.reasoning) return message;
  const { reasoning, ...rest } = message;
  return { ...rest, reasoning_content: reasoning };
}

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

/** Thrown to end a request refused as over the window, so room is made */
const REFIT = new Error("prompt over the window");

/**
 * The prompt's size in tokens when llama-server refused it for being over
 * the window, from its error body; null for any other error
 */
export function overflowedPrompt(errorBody: string): number | null {
  try {
    const { error } = JSON.parse(errorBody) as {
      error?: { type?: string; n_prompt_tokens?: number };
    };
    return error?.type === "exceed_context_size_error" &&
      typeof error.n_prompt_tokens === "number"
      ? error.n_prompt_tokens
      : null;
  } catch {
    return null;
  }
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
 * SHIELD_THOUGHT_LOG=<file>: each request's thinking and reply, one JSON line
 * per request. Off by default; for test runs that study how the model
 * decided, since its thinking is otherwise shown live and never kept.
 */
function appendThoughtLog(entry: Record<string, unknown>): void {
  const file = process.env.SHIELD_THOUGHT_LOG;
  if (!file) return;
  try {
    fs.appendFileSync(
      file,
      `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`
    );
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
  /** presence_penalty for every request (ServerLoadOptions) */
  private presencePenalty: number | undefined;
  /**
   * Tools sent as native function definitions, for a model whose catalog
   * sets nativeToolCalls (llamaServer/nativeCalls.ts); empty otherwise.
   * A forked session gets its agent role's own (`fork`'s `tools`).
   */
  private nativeTools: OpenAiTool[] = [];
  /**
   * Their definitions' length: sent with every request, outside the
   * messages, so counted in the window apart from them. Left out, a
   * history just summarised was taken to have ~1,200 more tokens of room
   * than it had, and the next request was refused for being over the
   * window (9,351 of 8,192 tokens, Qwen3.8 27B, 2026-11-05)
   */
  private nativeToolChars = 0;
  /** True while a request refused for its length is being sent again */
  private refitting = false;
  /** True while a reply that repeated the last one is being asked again */
  private varying = false;
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
    options: {
      keepWholeHistory?: boolean;
      /**
       * The agent's tools, sent natively as for the main session; empty
       * when the model takes the text form. Agents used the text form only
       * until the user decided on native calls for them too (2026-11-07)
       */
      tools?: ToolDefinition[];
    } = {}
  ): LlamaServerProvider {
    if (!this.isRunning()) {
      throw new Error("No model loaded. Call loadModel() first");
    }
    const session = new LlamaServerProvider();
    session.parent = this;
    session.contextSize = this.contextSize;
    session.trainContextSize = this.trainContextSize;
    session.reasoningEffort = this.reasoningEffort;
    session.presencePenalty = this.presencePenalty;
    session.applySystemPrompt(systemPrompt, options.tools ?? []);
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
          "Install it from Settings › Runtime, or set SHIELD_LLAMA_SERVER to a llama.cpp build with --fit."
      );
    }

    this.systemPrompt = options.systemPrompt;
    this.reasoningEffort = options.reasoningEffort;
    this.presencePenalty = options.presencePenalty;
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
      reasoningBudget: options.reasoningBudget,
    });
    console.log(`[LlamaServer] Starting ${binary} ${args.join(" ")}`);

    this.logTail = [];
    // Never `detached`: on Windows libuv puts attached children in a job
    // object that kills them when SHIELD's main process dies, even from a
    // crash or Task Manager (verified 2026-09-24). That is what keeps a
    // hard-killed SHIELD from leaving ~22 GB committed to an orphaned server.
    const child = spawn(binary, args, {
      windowsHide: true,
      env: serverEnv(options.placement),
    });
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

  /**
   * With native calls, the turns in the template's own form (nativeHistory).
   * The thinking of each reply since the user's latest message goes back as
   * `reasoning_content` (withRequestThinking).
   */
  private messages(extra?: ChatMessage) {
    const turns = withRequestThinking([
      ...this.history,
      ...(extra ? [extra] : []),
    ]);
    const wire = this.nativeTools.length > 0 ? nativeHistory(turns) : turns;
    return [
      { role: "system", content: this.systemContent() },
      ...wire.map(asWire),
    ];
  }

  /** Before a request has measured it: ~3 characters per token */
  private estimateTokens(): number {
    return (
      (this.systemContent().length +
        this.nativeToolChars +
        withRequestThinking(this.history).reduce(
          (n, m) => n + m.content.length + (m.reasoning?.length ?? 0),
          0
        )) /
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
    /** The reply's thinking, kept only for SHIELD_THOUGHT_LOG */
    let thinking = "";
    let final: ChatStreamChunk | null = null;
    /** The whole prompt, once the server says how long it is */
    let promptTokens = 0;
    let retryWithoutThinking = false;
    let restartAfterStall = false;
    /** The prompt's size as the server counted it, when it refused it as too long */
    let refitFrom: number | null = null;
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
      // "none" in the catalog: never thinks
      const thinks =
        options.thinking !== false && this.reasoningEffort !== "none";
      appendServerLog(
        `[SHIELD] chat request, thinking ${thinks ? "on" : "off"}`
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
        ...(this.presencePenalty !== undefined
          ? { presence_penalty: this.presencePenalty }
          : {}),
        ...(this.nativeTools.length > 0 ? { tools: this.nativeTools } : {}),
        ...(!thinks
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
        const text = await response.text();
        const measured = this.endpoint ? null : overflowedPrompt(text);
        if (measured === null || this.refitting) {
          throw new Error(this.httpError(response.status, text));
        }
        refitFrom = measured;
        throw REFIT;
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
      /** The reply's own text (not its calls), for the result-framing check */
      let written = "";
      const calls = new NativeCallWriter(
        (tool) => this.toolServers.get(tool) ?? "filesystem"
      );
      reading: for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const chunk of parser.push(
          decoder.decode(value, { stream: true })
        )) {
          const thought = chunk.choices?.[0]?.delta?.reasoning_content;
          if (thought) thinking += thought;
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
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) written += content;
          // The same written as plain text: IQ1_M went on for 5 minutes
          // with made-up results and was summarised 8 times (2026-11-05)
          const imagined =
            content &&
            this.nativeTools.length > 0 &&
            RESULT_FRAMING.test(written.slice(-content.length - 40));
          if ((deltas && calls.ranPastCall()) || imagined) {
            appendServerLog(
              "[SHIELD] the reply ran on into a result the model wrote itself: reply ended there"
            );
            // Only text the model wrote as its own: the framing is cut off
            if (imagined) {
              const at = reply.search(RESULT_FRAMING);
              if (at >= 0) reply = reply.slice(0, at).trimEnd();
            }
            await reader.cancel().catch(() => undefined);
            break reading;
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
      if (error === REFIT) {
        // Nothing was written; room is made below
      } else if (rescued.signal.aborted && !signal.aborted) {
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
      if (process.env.SHIELD_THOUGHT_LOG && !this.endpoint) {
        appendThoughtLog({
          session: this.systemPrompt.slice(0, 60),
          message: message.slice(0, 2000),
          promptTokens,
          thinking,
          reply,
          seconds: +((performance.now() - startedAt) / 1000).toFixed(1),
        });
      }
    }
    // Nothing of a dropped reply is kept: the history is as it was
    if (refitFrom !== null) {
      // Room made from the server's own count, once: a prompt refused
      // again is more than clearing and a summary can bring down. The
      // latest exchange's payloads go too, which making room never clears:
      // a 5,360-character read and a 5,763-character write_file held the
      // window over after the summary, and the same prompt was sent again
      // (Qwen3.8 27B at 8K, 2026-11-05). A file can be read again.
      appendServerLog(
        `[SHIELD] prompt of ${refitFrom} tokens refused as over the window: made room and sent once more`
      );
      this.lastContextTokens = refitFrom - message.length / 3;
      this.clearPayloads(0);
      this.refitting = true;
      try {
        return await this.chat(message, options, restarts);
      } finally {
        this.refitting = false;
      }
    }
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
    // Once, on SHIELD's own server: nothing at all came back
    if (
      !this.endpoint &&
      reply.trim() === "" &&
      !signal.aborted &&
      !message.endsWith(EMPTY_REPLY_NOTE)
    ) {
      appendServerLog("[SHIELD] empty reply: sent once more with a note");
      return this.chat(
        message + EMPTY_REPLY_NOTE,
        { ...options, thinking: false },
        restarts
      );
    }

    // A call the server ran on past its value goes into the history as the
    // calls recovered from it: the model copied the broken one next round
    const content =
      this.nativeTools.length > 0 ? unswallowQwenCalls(reply) : reply;
    // Once, on SHIELD's own server: a reply with a call is the last one
    // again, word for word (a plain answer may well be: "Done."). Qwen3.8 IQ1_M at temperature 0.5 sent the same 435
    // characters and call four times, each after being told the call had
    // been made, until the loop guard stopped it (2026-11-05)
    const previous = [...this.history]
      .reverse()
      .find((m) => m.role === "assistant");
    if (
      !this.endpoint &&
      !this.varying &&
      !signal.aborted &&
      content.includes("<tool_call>") &&
      content === previous?.content
    ) {
      appendServerLog(
        "[SHIELD] the same reply as last time: sent once more, sampled more loosely"
      );
      this.varying = true;
      try {
        return await this.chat(
          message,
          {
            ...options,
            temperature: Math.min(1, (options.temperature ?? 0.7) + 0.4),
          },
          restarts
        );
      } finally {
        this.varying = false;
      }
    }
    // A removal note the model copied stays out of its history: from its
    // own turns it learns to write more (historyCompaction, 2026-11-09)
    const kept = keptThinking(thinking);
    this.history.push(userMessage, {
      role: "assistant",
      content: stripRemovalNotes(content),
      ...(kept ? { reasoning: kept } : {}),
    });
    if (final?.usage) {
      this.lastContextTokens = nextPromptTokens(final.usage, reply + kept);
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
    // As the last request sent it: the note goes on from there (noteBody)
    const sent = this.history;
    if (this.makeRoomCheaply(nextMessage.length)) return;

    onProgress?.({ phase: "summarising" });
    const summarised = await summariseOldest(
      this.history,
      this.capsule,
      keepCharsFor(
        this.contextSize,
        this.systemPrompt.length + this.nativeToolChars,
        CLEAR_TO
      ),
      () => this.writeNote(sent, nextMessage, signal)
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

    // Old copies of files read again since go first: they are out of date
    this.clearStaleReads();
    if (under(CLEAR_TO)) return true;

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

  /** Clear the results of reads the model has since read again */
  private clearStaleReads(): void {
    const { history, savedChars } = compactStaleReads(this.history);
    if (savedChars <= 0) return;
    this.history = history;
    this.lastContextTokens = Math.max(
      0,
      this.lastContextTokens - savedChars / 3
    );
    console.log(
      `[LlamaServer] Compacted history: cleared ${savedChars} characters of files read again since`
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
   * after it (`nextMessage`). `turns`: the history as the last request sent
   * it, before clearing, so the server goes on from its saved state
   * (noteBody).
   */
  private async writeNote(
    turns: ChatMessage[],
    nextMessage: string,
    signal: AbortSignal
  ): Promise<string> {
    const result = await this.completion(
      {
        ...noteBody(this.systemContent(), turns, nextMessage, this.nativeTools),
        cache_prompt: true,
        temperature: 0.2,
        max_tokens: NOTE_MAX_TOKENS,
        // With thinking on, Bonsai 2 spent the note's tokens thinking and
        // its note stopped mid-sentence, before the Offered and Facts
        // lines (growing-project g14, 2026-11-10)
        chat_template_kwargs: { enable_thinking: false },
      },
      signal
    );
    return result.choices?.[0]?.message?.content ?? "";
  }

  applySystemPrompt(prompt: string, tools: ToolDefinition[] = []): void {
    this.systemPrompt = prompt;
    this.nativeTools = openAiTools(tools);
    this.nativeToolChars =
      this.nativeTools.length > 0 ? JSON.stringify(this.nativeTools).length : 0;
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
   * What fills the context window. Token counts come
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
    // The pieces counted below stand in for the rendered total then. Such a
    // chat is not sent at all: each refusal was an HTTP 500 in the server
    // log, three at the start of every team run (2026-11-08)
    let prompt = "";
    const messages = this.messages();
    try {
      if (messages.some((m) => m.role === "user")) {
        ({ prompt } = (await this.post("/apply-template", { messages })) as {
          prompt: string;
        });
      }
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
