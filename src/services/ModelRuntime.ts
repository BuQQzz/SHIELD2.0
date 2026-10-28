/**
 * Model runtime facade (main process only)
 *
 * The IPC layer talks to this; it routes each library model to the engine
 * that runs it (see ModelRuntime in config/models.ts):
 * - node-llama-cpp in-process (LlamaService)
 * - a SHIELD-managed llama-server (LlamaServerProvider)
 *
 * Only one model is loaded at a time. Switching engines unloads the other
 * first, so the new model gets the whole GPU.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { readGgufFileInfo } from "node-llama-cpp";
import { getModelById, usesLlamaServer } from "../config/models.js";
import { samplingFromGguf, type RecommendedSampling } from "./modelSampling.js";
import { planServerContext, type ContextPlan } from "./contextPlanner.js";
import {
  assessMemory,
  readSystemMemory,
  type MemoryCheck,
  type MemoryNeed,
} from "./memoryCheck.js";
import type { ContextBreakdown } from "./contextBreakdown.js";
import {
  getLlamaService,
  type ChatOptions,
  type ContextUsage,
  type GenerationStats,
  type LlamaService,
  type ModelConfig,
} from "./LlamaService.js";
import { LlamaServerProvider } from "./LlamaServerProvider.js";
import type { RequestStatus, RescueAction } from "./llamaServer/rescue.js";
import type { SavedCapsule, SavedMessage } from "./taskCapsule.js";
import type { ToolDefinition } from "../types/prompts.js";

type Engine = "node" | "server";

export class ModelRuntime {
  private readonly node: LlamaService = getLlamaService();
  private readonly server = new LlamaServerProvider();
  private engine: Engine = "node";
  private systemPrompt = "You are a helpful AI assistant.";
  private serverModel: ModelConfig | null = null;
  private requestedServerContext: number | undefined;
  private serverPlans = new Map<string, Promise<ContextPlan>>();
  private samplings = new Map<string, Promise<RecommendedSampling | null>>();
  private pidFile: string | undefined;
  /** Chats of sub-agents on the running server (see createAgentSession) */
  private agentSessions = new Map<string, LlamaServerProvider>();
  private nextAgentSession = 1;
  /** Estimated memory of the loaded model; freed before the next load */
  private held: MemoryNeed | undefined;

  constructor() {
    // Never leave a server holding the GPU after SHIELD exits
    process.once("exit", () => this.server.killNow());
  }

  /**
   * Where the server PID is kept; a server orphaned by a crash is stopped
   * here on the next launch.
   */
  setStateDir(dir: string): void {
    this.pidFile = path.join(dir, "llama-server.pid");
    killOrphanedServer(this.pidFile);
  }

  setCustomModelsDir(dir: string | undefined): void {
    this.node.setCustomModelsDir(dir);
  }

  initialize(): Promise<void> {
    return this.node.initialize();
  }

  getHardwareInfo() {
    return this.node.getHardwareInfo();
  }

  /**
   * Loads the model, unless it needs more system memory than is free and
   * the user has not accepted that (`allowLowMemory`): then nothing is
   * unloaded or loaded, and `memory` says why.
   */
  async loadModel(
    config: ModelConfig
  ): Promise<{ warning?: string; memory?: MemoryCheck }> {
    // Reading free commit takes ~1.5 s on Windows; overlap it with the plan
    const system = config.allowLowMemory ? undefined : readSystemMemory();
    const need = await this.estimateMemory(config);
    if (need && system) {
      const check = assessMemory(need, await system, this.held);
      if (!check.ok) {
        console.warn(
          `[ModelRuntime] Holding back ${config.id}: ${check.problems.join(" ")}`
        );
        return { memory: check };
      }
    }

    this.held = undefined;
    const result = await this.loadEngine(config);
    this.held = need;
    return result;
  }

  /**
   * What the model needs at the context it will load with, from the
   * context plan. Undefined when the plan cannot be made - the load then
   * goes ahead unchecked rather than being blocked by the estimate.
   */
  private async estimateMemory(
    config: ModelConfig
  ): Promise<MemoryNeed | undefined> {
    try {
      const plan = await this.getContextPlan(config.id);
      const size = config.contextSize ?? plan.recommended;
      const option =
        plan.options.find((o) => o.contextSize >= size) ?? plan.options.at(-1);
      return option?.memory;
    } catch (error) {
      console.warn("[ModelRuntime] No memory estimate:", error);
      return undefined;
    }
  }

  private async loadEngine(config: ModelConfig): Promise<{ warning?: string }> {
    this.closeAgentSessions();
    const model = getModelById(config.id);
    if (!usesLlamaServer(model?.runtime)) {
      if (this.server.isRunning()) await this.server.stop();
      this.serverModel = null;
      this.engine = "node";
      return this.node.loadModel(config);
    }

    if (
      this.engine === "server" &&
      this.server.isRunning() &&
      this.serverModel?.id === config.id &&
      this.requestedServerContext === config.contextSize
    ) {
      return {};
    }

    // Free the GPU before the server starts fitting into it
    await this.node.cleanup();
    const modelPath = await this.node.resolveModelPath(config.id);
    const contextSize =
      config.contextSize ?? (await this.getContextPlan(config.id)).recommended;
    await this.server.load({
      modelPath,
      contextSize,
      systemPrompt: this.systemPrompt,
      pidFile: this.pidFile,
      placement: model?.serverPlacement,
    });

    this.engine = "server";
    this.requestedServerContext = config.contextSize;
    this.serverModel = { ...config, contextSize: this.server.getContextSize() };
    return {};
  }

  async getContextPlan(modelId: string): Promise<ContextPlan> {
    const model = getModelById(modelId);
    if (!model || !usesLlamaServer(model.runtime)) {
      return this.node.getContextPlan(modelId);
    }

    const modelPath = await this.node.resolveModelPath(modelId);
    let plan = this.serverPlans.get(modelPath);
    if (!plan) {
      plan = this.node.getLlama().then(async (llama) => {
        const { total } = await llama.getVramState();
        return planServerContext(modelPath, llama, total, model.contextSize);
      });
      plan.catch(() => this.serverPlans.delete(modelPath));
      this.serverPlans.set(modelPath, plan);
    }
    return plan;
  }

  /**
   * The sampling a library model recommends: its GGUF's general.sampling,
   * else the catalog's (Qwen3-Coder's file has none), else null.
   */
  getRecommendedSampling(modelId: string): Promise<RecommendedSampling | null> {
    let found = this.samplings.get(modelId);
    if (!found) {
      found = this.node
        .resolveModelPath(modelId)
        .then((modelPath) =>
          readGgufFileInfo(modelPath, { readTensorInfo: false })
        )
        // Read from the file, though node-llama-cpp's types leave it out
        .then((info) =>
          samplingFromGguf(
            (info.metadata.general as { sampling?: unknown } | undefined)
              ?.sampling
          )
        )
        .catch(() => null)
        .then((fromFile) => {
          if (fromFile) return fromFile;
          const catalog = getModelById(modelId)?.sampling;
          return catalog ? { source: "catalog" as const, ...catalog } : null;
        });
      this.samplings.set(modelId, found);
    }
    return found;
  }

  chat(message: string, options: ChatOptions = {}): Promise<string> {
    return this.engine === "server"
      ? this.server.chat(message, options)
      : this.node.chat(message, options);
  }

  chatStreaming(
    message: string,
    onToken: (token: string) => void,
    options: Omit<ChatOptions, "onToken"> = {}
  ): Promise<string> {
    return this.chat(message, { ...options, onToken });
  }

  getLastStats(): GenerationStats | null {
    return this.engine === "server"
      ? this.server.getLastStats()
      : this.node.getLastStats();
  }

  /** The capsule the last request wrote to make room (llama-server only) */
  getLastSummary(): string | null {
    return this.engine === "server" ? this.server.getLastSummary() : null;
  }

  /** The same capsule for the chat to save and restore from */
  getLastCapsule(): SavedCapsule | null {
    return this.engine === "server" ? this.server.getLastCapsule() : null;
  }

  async getContextUsage(): Promise<ContextUsage | null> {
    return this.engine === "server"
      ? this.server.getContextUsage()
      : this.node.getContextUsage();
  }

  async getContextBreakdown(): Promise<ContextBreakdown | null> {
    return this.engine === "server"
      ? this.server.getContextBreakdown()
      : this.node.getContextBreakdown();
  }

  getModelInfo(): ModelConfig | null {
    return this.engine === "server"
      ? this.serverModel
      : this.node.getModelInfo();
  }

  isModelLoaded(): boolean {
    return this.engine === "server"
      ? this.server.isRunning()
      : this.node.isModelLoaded();
  }

  /** node-llama-cpp restores the chat whole; it has no capsules */
  setChatHistory(messages: SavedMessage[]): void {
    if (this.engine === "server") this.server.setChatHistory(messages);
    else this.node.setChatHistory(messages);
  }

  clearHistory(): void {
    if (this.engine === "server") this.server.clearHistory();
    else this.node.clearHistory();
  }

  stopGeneration(): void {
    if (this.engine === "server") this.server.stopGeneration();
    else this.node.stopGeneration();
    for (const session of this.agentSessions.values()) {
      session.stopGeneration();
    }
  }

  /** The request in progress, for the stuck bar; the in-process engine has none */
  requestStatus(): RequestStatus | null {
    return this.engine === "server" ? this.server.requestStatus() : null;
  }

  /** Nudge, skip or restart a request that looks stuck (rescue.ts) */
  rescue(action: RescueAction): boolean {
    return this.engine === "server" && this.server.rescue(action);
  }

  /**
   * A chat for a sub-agent: own system prompt and history, on the model that
   * is loaded. Only models run by llama-server can host one; the in-process
   * engine has a single chat session.
   */
  createAgentSession(systemPrompt: string): string {
    if (this.engine !== "server" || !this.server.isRunning()) {
      throw new Error(
        "Agent teams need a model that runs on llama-server (Bonsai, Qwen3-Coder). The loaded model does not, or none is loaded."
      );
    }
    const id = `agent-${this.nextAgentSession++}`;
    this.agentSessions.set(
      id,
      this.server.fork(systemPrompt, { keepWholeHistory: true })
    );
    return id;
  }

  private agentSession(id: string): LlamaServerProvider {
    const session = this.agentSessions.get(id);
    if (!session) throw new Error(`Unknown agent session ${id}`);
    return session;
  }

  agentChat(
    id: string,
    message: string,
    options: ChatOptions = {}
  ): Promise<string> {
    return this.agentSession(id).chat(message, options);
  }

  /** Tokens the session's last request used, against the window */
  getAgentContext(id: string): { used: number; size: number } {
    return this.agentSession(id).getMeasuredContext();
  }

  closeAgentSession(id: string): void {
    this.agentSessions.get(id)?.stopGeneration();
    this.agentSessions.delete(id);
  }

  private closeAgentSessions(): void {
    for (const id of [...this.agentSessions.keys()]) {
      this.closeAgentSession(id);
    }
  }

  /** Both engines keep it, so a model switch starts with the right prompt */
  async applySystemPrompt(
    prompt: string,
    tools?: ToolDefinition[]
  ): Promise<void> {
    this.systemPrompt = prompt;
    this.server.applySystemPrompt(prompt);
    await this.node.applySystemPrompt(prompt, tools);
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  generateTitle(userMessage: string): Promise<string> {
    return this.engine === "server"
      ? this.server.generateTitle(userMessage)
      : this.node.generateTitle(userMessage);
  }

  async dispose(): Promise<void> {
    this.closeAgentSessions();
    await this.server.stop();
    await this.node.dispose();
  }
}

/**
 * Stop a llama-server left running by a previous SHIELD that crashed. Only
 * kills the recorded PID if it still is a llama-server process.
 */
function killOrphanedServer(pidFile: string): void {
  let pid: number;
  try {
    pid = Number(fs.readFileSync(pidFile, "utf8"));
  } catch {
    return;
  }
  try {
    if (process.platform === "win32") {
      const listing = execFileSync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { encoding: "utf8", windowsHide: true }
      );
      if (listing.toLowerCase().includes("llama-server")) {
        process.kill(pid);
        console.log(`[ModelRuntime] Stopped orphaned llama-server ${pid}`);
      }
    }
  } catch (error) {
    console.warn("[ModelRuntime] Could not check orphaned server:", error);
  }
  fs.rmSync(pidFile, { force: true });
}

let instance: ModelRuntime | null = null;

export function getModelRuntime(): ModelRuntime {
  instance ??= new ModelRuntime();
  return instance;
}
