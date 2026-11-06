/**
 * Model runtime facade (main process only)
 *
 * The IPC layer talks to this; it routes each model to what runs it:
 * - a library model: a SHIELD-managed llama-server (LlamaServerProvider)
 * - a hosted model: the same chat handling, attached to a provider
 *
 * Only one model is loaded at a time. Switching stops the other first, so
 * a new local model gets the whole GPU.
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
import type {
  ChatOptions,
  ContextUsage,
  GenerationStats,
  ModelConfig,
} from "./chatTypes.js";
import {
  getHardwareInfo,
  getLlamaBindings,
  resolveModelFile,
  resolveModelPath,
  setModelsDir,
} from "./localModels.js";
import { LlamaServerProvider } from "./LlamaServerProvider.js";
import type { RequestStatus, RescueAction } from "./llamaServer/rescue.js";
import type { SavedCapsule, SavedMessage } from "./taskCapsule.js";
import type { ToolDefinition } from "../types/prompts.js";
import {
  isRemoteModelId,
  parseRemoteModelId,
  type GatewayPosture,
  type RemoteProviderSource,
} from "./remote/remoteEndpoint.js";
import {
  catalogBase,
  fetchCatalogContext,
  listRemoteModels,
  zdrBlock,
} from "./remote/remoteModels.js";

type Engine = "server" | "remote";

export class ModelRuntime {
  private readonly server = new LlamaServerProvider();
  /** Chats with a hosted model: the same chat handling, no process (attach) */
  private readonly remote = new LlamaServerProvider();
  private providers: RemoteProviderSource | null = null;
  private engine: Engine | null = null;
  private systemPrompt = "You are a helpful AI assistant.";
  private serverModel: ModelConfig | null = null;
  private remoteModel: ModelConfig | null = null;
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
    setModelsDir(dir);
  }

  /** Where saved providers and their keys are found (the ProviderStore) */
  setProviderSource(source: RemoteProviderSource): void {
    this.providers = source;
  }

  /**
   * The provider that serves the loaded model: the local server or the
   * hosted model. Null when no model is loaded.
   */
  private get hosted(): LlamaServerProvider | null {
    if (this.engine === "server") return this.server;
    if (this.engine === "remote") return this.remote;
    return null;
  }

  /** Stop using a provider that was removed, if its model is the loaded one */
  async forgetProvider(providerId: string): Promise<void> {
    const loaded = parseRemoteModelId(this.remoteModel?.id ?? "");
    if (this.engine !== "remote" || loaded?.providerId !== providerId) return;
    this.closeAgentSessions();
    await this.remote.stop();
    this.remoteModel = null;
    this.engine = null;
  }

  /** Loads the llama.cpp bindings used for VRAM and GGUF reading */
  async initialize(): Promise<void> {
    await getLlamaBindings();
  }

  getHardwareInfo() {
    return getHardwareInfo();
  }

  /**
   * Loads the model, unless it needs more system memory than is free and
   * the user has not accepted that (`allowLowMemory`): then nothing is
   * unloaded or loaded, and `memory` says why.
   */
  async loadModel(
    config: ModelConfig
  ): Promise<{ warning?: string; memory?: MemoryCheck }> {
    // A hosted model needs none of this machine's memory, and frees what the
    // model it replaces held
    if (isRemoteModelId(config.id)) {
      this.held = undefined;
      return this.loadEngine(config);
    }

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

  /**
   * Attach to a hosted model. The provider is asked for its model list first:
   * that proves the key works, gives the model's context window, and shows
   * before anything is sent whether a required zero-retention route exists.
   */
  private async loadRemote(config: ModelConfig): Promise<{ warning?: string }> {
    const parsed = parseRemoteModelId(config.id);
    const resolved = parsed && this.providers?.resolve(parsed.providerId);
    if (!parsed || !resolved) {
      throw new Error(
        "That provider is not set up, or its key could not be read. Add it again in Settings > Providers."
      );
    }
    const { config: provider, apiKey } = resolved;

    // Asked together: the list proves the key, the catalog gives the window
    const base = catalogBase(provider);
    const [listed, catalog] = await Promise.all([
      listRemoteModels({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey,
      }),
      base ? fetchCatalogContext(base, parsed.model) : undefined,
    ]);
    if (!listed.ok) throw new Error(listed.error);
    const model = listed.models?.find((m) => m.id === parsed.model);
    // A model the user allowed without a zero-retention route is not held to
    // it, and its request does not ask for one (so the provider is free to
    // serve it, and the reply's badge reports what it really was)
    const allowedNoZdr = (provider.allowNoZdr ?? []).includes(parsed.model);
    const requireZdr = provider.requireZdr && !allowedNoZdr;
    if (requireZdr && model) {
      const blocked = zdrBlock(provider.name, model);
      if (blocked) throw new Error(blocked);
    }

    // Nothing runs here: free the GPU and RAM a local model held
    if (this.server.isRunning()) await this.server.stop();
    this.serverModel = null;

    // The user's own choice, else what the provider says this model takes
    // (every model differs: a flash model at 1M, another at 128K), else the
    // provider's default for a model it does not describe
    const contextSize =
      config.contextSize ??
      catalog?.usable ??
      model?.contextLength ??
      provider.defaultContext;
    console.log(
      `[Remote] Context ${contextSize} for ${parsed.model} (${
        config.contextSize
          ? "chosen"
          : catalog
            ? `provider catalog: window ${catalog.contextWindow ?? "?"}, input ${catalog.maxInputTokens ?? "?"}`
            : model?.contextLength
              ? "provider's model list"
              : "default, the provider did not say"
      })`
    );
    await this.remote.attach(
      {
        providerId: provider.id,
        providerName: provider.name,
        baseUrl: provider.baseUrl,
        apiKey,
        model: parsed.model,
        contextSize,
        requireZdr,
      },
      this.systemPrompt
    );
    this.engine = "remote";
    this.remoteModel = { ...config, contextSize };
    return {};
  }

  private async loadEngine(config: ModelConfig): Promise<{ warning?: string }> {
    this.closeAgentSessions();
    if (isRemoteModelId(config.id)) return this.loadRemote(config);
    if (this.remote.isRunning()) await this.remote.stop();
    const model = getModelById(config.id);
    if (!usesLlamaServer(model?.runtime)) {
      throw new Error(
        `Unknown model "${config.id}". Pick one from the library.`
      );
    }

    if (
      this.engine === "server" &&
      this.server.isRunning() &&
      this.serverModel?.id === config.id &&
      this.requestedServerContext === config.contextSize
    ) {
      return {};
    }

    const installed = await resolveModelFile(config.id);
    const contextSize =
      config.contextSize ?? (await this.getContextPlan(config.id)).recommended;
    await this.server.load({
      modelPath: installed.path,
      contextSize,
      systemPrompt: this.systemPrompt,
      pidFile: this.pidFile,
      placement: installed.file.serverPlacement ?? model?.serverPlacement,
      reasoningEffort: installed.file.reasoningEffort ?? model?.reasoningEffort,
      reasoningBudget: installed.file.reasoningBudget,
      presencePenalty: model?.presencePenalty,
    });

    this.engine = "server";
    this.requestedServerContext = config.contextSize;
    this.serverModel = { ...config, contextSize: this.server.getContextSize() };
    return {};
  }

  async getContextPlan(modelId: string): Promise<ContextPlan> {
    // A hosted model's window is the provider's, not a trade against this GPU
    const remote = parseRemoteModelId(modelId);
    if (remote) {
      const context =
        this.providers?.resolve(remote.providerId)?.config.defaultContext ??
        32768;
      return {
        trainContextSize: context,
        totalLayers: 0,
        options: [{ contextSize: context, gpuLayers: 0 }],
        recommended: context,
      };
    }
    const model = getModelById(modelId);
    if (!model || !usesLlamaServer(model.runtime)) {
      throw new Error(`Unknown model "${modelId}". Pick one from the library.`);
    }

    const installed = await resolveModelFile(modelId);
    const modelPath = installed.path;
    let plan = this.serverPlans.get(modelPath);
    if (!plan) {
      plan = getLlamaBindings().then(async (llama) => {
        const { total } = await llama.getVramState();
        return planServerContext(
          modelPath,
          llama,
          total,
          installed.file.contextSize ?? model.contextSize
        );
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
    if (isRemoteModelId(modelId)) return Promise.resolve(null);
    let found = this.samplings.get(modelId);
    if (!found) {
      found = resolveModelPath(modelId)
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

  /** The loaded model's provider; throws when none is loaded */
  private get loaded(): LlamaServerProvider {
    if (!this.hosted) throw new Error("No model loaded. Load one first.");
    return this.hosted;
  }

  chat(message: string, options: ChatOptions = {}): Promise<string> {
    return this.loaded.chat(message, options);
  }

  chatStreaming(
    message: string,
    onToken: (token: string) => void,
    options: Omit<ChatOptions, "onToken"> = {}
  ): Promise<string> {
    return this.chat(message, { ...options, onToken });
  }

  getLastStats(): GenerationStats | null {
    return this.hosted?.getLastStats() ?? null;
  }

  /** The capsule the last request wrote to make room (llama-server only) */
  getLastSummary(): string | null {
    return this.hosted?.getLastSummary() ?? null;
  }

  /** The same capsule for the chat to save and restore from */
  getLastCapsule(): SavedCapsule | null {
    return this.hosted?.getLastCapsule() ?? null;
  }

  /** The loaded model runs at a provider: what is said to it leaves this device */
  isHosted(): boolean {
    return this.engine === "remote";
  }

  /**
   * How a hosted provider said the last request was served: which provider
   * answered, and whether it reported zero data retention. Null for a local
   * model, which sends nothing anywhere.
   */
  getLastServedBy(): GatewayPosture | null {
    return this.engine === "remote" ? this.remote.getLastServedBy() : null;
  }

  async getContextUsage(): Promise<ContextUsage | null> {
    return this.hosted?.getContextUsage() ?? null;
  }

  async getContextBreakdown(): Promise<ContextBreakdown | null> {
    return this.hosted?.getContextBreakdown() ?? null;
  }

  getModelInfo(): ModelConfig | null {
    if (this.engine === "remote") return this.remoteModel;
    return this.engine === "server" ? this.serverModel : null;
  }

  isModelLoaded(): boolean {
    return this.hosted?.isRunning() ?? false;
  }

  setChatHistory(messages: SavedMessage[]): void {
    this.hosted?.setChatHistory(messages);
  }

  clearHistory(): void {
    this.hosted?.clearHistory();
  }

  stopGeneration(): void {
    this.hosted?.stopGeneration();
    for (const session of this.agentSessions.values()) {
      session.stopGeneration();
    }
  }

  /** The request in progress, for the stuck bar */
  requestStatus(): RequestStatus | null {
    return this.hosted?.requestStatus() ?? null;
  }

  /** Nudge, skip or restart a request that looks stuck (rescue.ts) */
  rescue(action: RescueAction): boolean {
    return this.hosted?.rescue(action) ?? false;
  }

  /**
   * A chat for a sub-agent: own system prompt and history, on the model that
   * is loaded.
   */
  createAgentSession(systemPrompt: string): string {
    const host = this.hosted;
    if (!host || !host.isRunning()) {
      throw new Error("Agent teams need a loaded model. Load one first.");
    }
    const id = `agent-${this.nextAgentSession++}`;
    this.agentSessions.set(
      id,
      host.fork(systemPrompt, { keepWholeHistory: true })
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

  /** Both providers keep it, so a model switch starts with the right prompt */
  async applySystemPrompt(
    prompt: string,
    tools?: ToolDefinition[]
  ): Promise<void> {
    this.systemPrompt = prompt;
    this.server.applySystemPrompt(prompt, tools);
    this.remote.applySystemPrompt(prompt);
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  generateTitle(userMessage: string): Promise<string> {
    return this.loaded.generateTitle(userMessage);
  }

  async dispose(): Promise<void> {
    this.closeAgentSessions();
    await this.server.stop();
    await this.remote.stop();
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
