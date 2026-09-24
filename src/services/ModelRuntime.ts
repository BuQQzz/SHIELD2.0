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
import { getModelById } from "../config/models.js";
import { planServerContext, type ContextPlan } from "./contextPlanner.js";
import type { ContextBreakdown } from "./contextBreakdown.js";
import {
  getLlamaService,
  type ChatMessage,
  type ChatOptions,
  type ContextUsage,
  type GenerationStats,
  type LlamaService,
  type ModelConfig,
} from "./LlamaService.js";
import { LlamaServerProvider } from "./LlamaServerProvider.js";

type Engine = "node" | "server";

export class ModelRuntime {
  private readonly node: LlamaService = getLlamaService();
  private readonly server = new LlamaServerProvider();
  private engine: Engine = "node";
  private systemPrompt = "You are a helpful AI assistant.";
  private serverModel: ModelConfig | null = null;
  private requestedServerContext: number | undefined;
  private serverPlans = new Map<string, Promise<ContextPlan>>();
  private pidFile: string | undefined;

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

  async loadModel(config: ModelConfig): Promise<{ warning?: string }> {
    const model = getModelById(config.id);
    if (model?.runtime !== "llama-server") {
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
    });

    this.engine = "server";
    this.requestedServerContext = config.contextSize;
    this.serverModel = { ...config, contextSize: this.server.getContextSize() };
    return {};
  }

  async getContextPlan(modelId: string): Promise<ContextPlan> {
    const model = getModelById(modelId);
    if (model?.runtime !== "llama-server") {
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

  setChatHistory(messages: ChatMessage[]): void {
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
  }

  /** Both engines keep it, so a model switch starts with the right prompt */
  async applySystemPrompt(prompt: string): Promise<void> {
    this.systemPrompt = prompt;
    this.server.applySystemPrompt(prompt);
    await this.node.applySystemPrompt(prompt);
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
