/**
 * Connectors at run time: starting them, signing in, their tools and calls
 *
 * The model sees a connector's tools as `<id>__<tool>`, each described with
 * the connector's name in front. Calls come back here by that prefix.
 *
 * Read-only hints are taken only from catalog services, which SHIELD lists
 * after checking them: a server the user adds by hand could call any tool
 * read-only, and the permission modes run read-only tools without asking.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import os from "os";
import {
  CONNECTOR_CATALOG,
  connectorIdFor,
  connectorToolName,
  isValidToolName,
  toolTokens,
  type ConnectorConfig,
  type ConnectorState,
  type ConnectorSummary,
  type ManualConnectorInput,
} from "../../../src/config/connectors.js";
import type { ConnectorStore } from "./ConnectorStore.js";
import { ConnectorOAuth, startLoopback, type Loopback } from "./oauth.js";

/** Long enough to sign in, pick an account and approve */
const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const CONNECT_TIMEOUT_MS = 30_000;
/** Keeps a server's error message readable in the Plugins page */
const MAX_ERROR = 300;

interface RawTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
}

interface Runtime {
  state: ConnectorState;
  error?: string;
  client?: Client;
  tools: RawTool[];
  /** Bumped on every (dis)connect, so a stale attempt does not win */
  attempt: number;
}

export interface ConnectorCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

function message(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > MAX_ERROR ? `${text.slice(0, MAX_ERROR)}...` : text;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  what: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function newClient(): Client {
  return new Client({ name: "shield", version: "1.0.0" }, { capabilities: {} });
}

/** http(s) only, and no credentials in the address itself */
function checkedUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter the server's full address, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("The address must start with https://");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol === "http:" && !local) {
    throw new Error("Use https:// - only a server on this PC may use http://");
  }
  if (url.username || url.password) {
    throw new Error("Put a token in the token field, not in the address");
  }
  return url;
}

export class ConnectorService {
  private runtimes = new Map<string, Runtime>();
  /** Listeners of sign-ins in progress, closed when the connector stops */
  private signIns = new Map<string, Loopback>();

  constructor(
    private readonly store: ConnectorStore,
    private readonly hooks: {
      openExternal: (url: string) => void;
      /** Connectors or their tools changed: the renderer reloads them */
      onChange: () => void;
    }
  ) {}

  // ---- What the renderer sees -------------------------------------------

  summaries(): ConnectorSummary[] {
    return this.store.list().map((config) => this.summary(config));
  }

  private summary(config: ConnectorConfig): ConnectorSummary {
    const runtime = this.runtimes.get(config.id);
    const secrets = this.store.getSecrets(config.id);
    const disabled = new Set(config.disabledTools);
    const tools = runtime?.tools ?? [];
    return {
      ...config,
      state: config.enabled ? (runtime?.state ?? "off") : "off",
      ...(runtime?.error ? { error: runtime.error } : {}),
      hasCredentials: Boolean(
        secrets.token || secrets.oauth?.tokens || secrets.env
      ),
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        readOnly: this.readOnly(config, tool),
      })),
      toolTokens: tools
        .filter((tool) => !disabled.has(tool.name))
        .reduce((sum, tool) => sum + toolTokens(tool), 0),
    };
  }

  /** Ids of connectors whose tools the model can use now */
  connectedIds(): string[] {
    return this.store
      .list()
      .filter(
        (c) => c.enabled && this.runtimes.get(c.id)?.state === "connected"
      )
      .map((c) => c.id);
  }

  has(id: string): boolean {
    return this.store.get(id) !== undefined;
  }

  /** A connector's enabled tools, as the model is offered them */
  listTools(id: string): RawTool[] {
    const config = this.store.get(id);
    const runtime = this.runtimes.get(id);
    if (!config || runtime?.state !== "connected") return [];
    const disabled = new Set(config.disabledTools);
    return runtime.tools
      .filter((tool) => !disabled.has(tool.name))
      .map((tool) => {
        const name = connectorToolName(id, tool.name);
        const readOnly = this.readOnly(config, tool);
        return {
          name,
          description: `[${config.name}] ${tool.description ?? ""}`.trim(),
          inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          ...(readOnly ? { annotations: { readOnlyHint: true } } : {}),
        };
      })
      .filter((tool) => isValidToolName(tool.name));
  }

  private readOnly(config: ConnectorConfig, tool: RawTool): boolean {
    return Boolean(config.catalogId) && tool.annotations?.readOnlyHint === true;
  }

  async callTool(
    id: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<ConnectorCallResult> {
    const config = this.store.get(id);
    const runtime = this.runtimes.get(id);
    if (!config?.enabled || runtime?.state !== "connected" || !runtime.client) {
      return {
        success: false,
        error: `${config?.name ?? id} is not connected. The user can connect it on the Plugins page.`,
      };
    }
    if (config.disabledTools.includes(tool)) {
      return {
        success: false,
        error: `${tool} is switched off on the Plugins page.`,
      };
    }
    try {
      const data = await runtime.client.callTool({
        name: tool,
        arguments: args,
      });
      return { success: true, data };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        this.setState(
          id,
          "needs-auth",
          "Signed out - connect again on the Plugins page"
        );
      }
      return { success: false, error: message(error) };
    }
  }

  // ---- Adding and changing -----------------------------------------------

  /** Adds a catalog service; `token` for those that take one */
  async addFromCatalog(
    catalogId: string,
    token?: string
  ): Promise<ConnectorSummary> {
    const entry = CONNECTOR_CATALOG.find((e) => e.id === catalogId);
    if (!entry) throw new Error(`Unknown service: ${catalogId}`);
    if (entry.auth === "token" && !token?.trim()) {
      throw new Error(`${entry.name} needs a token`);
    }
    const existing = this.store.list().find((c) => c.catalogId === catalogId);
    const id =
      existing?.id ??
      connectorIdFor(
        entry.id,
        this.store.list().map((c) => c.id)
      );
    this.store.put({
      id,
      name: entry.name,
      enabled: true,
      disabledTools: existing?.disabledTools ?? [],
      catalogId,
      kind: "remote",
      url: entry.url,
      auth: entry.auth,
    });
    if (token?.trim()) {
      this.store.updateSecrets(id, (s) => {
        s.token = token.trim();
      });
    }
    await this.connect(id, true);
    return this.summary(this.store.get(id)!);
  }

  async addManual(input: ManualConnectorInput): Promise<ConnectorSummary> {
    const name = input.name.trim();
    if (!name) throw new Error("Give the server a name");
    const id = connectorIdFor(
      name,
      this.store.list().map((c) => c.id)
    );

    if (input.kind === "remote") {
      const url = checkedUrl(input.url);
      const token = input.token?.trim();
      // With a token, use it; without, sign in if the server asks
      this.store.put({
        id,
        name,
        enabled: true,
        disabledTools: [],
        kind: "remote",
        url: url.toString(),
        auth: token ? "token" : "oauth",
      });
      if (token) {
        this.store.updateSecrets(id, (s) => {
          s.token = token;
        });
      }
    } else {
      const command = input.command.trim();
      if (!command) throw new Error("Enter the command that starts the server");
      const env = Object.fromEntries(
        Object.entries(input.env)
          .map(([k, v]) => [k.trim(), v] as const)
          .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
      );
      this.store.put({
        id,
        name,
        enabled: true,
        disabledTools: [],
        kind: "local",
        command,
        args: input.args.filter((a) => a.length > 0),
        envNames: Object.keys(env),
      });
      if (Object.keys(env).length > 0) {
        this.store.updateSecrets(id, (s) => {
          s.env = env;
        });
      }
    }
    await this.connect(id, true);
    return this.summary(this.store.get(id)!);
  }

  async remove(id: string): Promise<void> {
    await this.disconnect(id);
    this.runtimes.delete(id);
    this.store.remove(id);
    this.hooks.onChange();
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const config = this.store.get(id);
    if (!config) return;
    this.store.put({ ...config, enabled });
    if (enabled) await this.connect(id, false);
    else await this.disconnect(id);
  }

  setToolEnabled(id: string, tool: string, enabled: boolean): void {
    const config = this.store.get(id);
    if (!config) return;
    const off = new Set(config.disabledTools);
    if (enabled) off.delete(tool);
    else off.add(tool);
    this.store.put({ ...config, disabledTools: [...off] });
    this.hooks.onChange();
  }

  /** Forgets the token or sign-in, and disconnects */
  async signOut(id: string): Promise<void> {
    await this.disconnect(id);
    this.store.updateSecrets(id, (s) => {
      delete s.token;
      delete s.oauth;
    });
    this.setState(id, "needs-auth");
  }

  // ---- Connecting --------------------------------------------------------

  /** Connects every enabled connector, without opening a browser */
  async startAll(): Promise<void> {
    await Promise.all(
      this.store
        .list()
        .filter((c) => c.enabled)
        .map((c) => this.connect(c.id, false))
    );
  }

  /**
   * Starts a connector. `interactive`: the user pressed Connect, so a
   * sign-in may open the browser. At startup it may not - a service that
   * needs one shows "Sign in" on the Plugins page instead.
   */
  async connect(id: string, interactive: boolean): Promise<void> {
    const config = this.store.get(id);
    if (!config) throw new Error(`Unknown connector: ${id}`);
    await this.disconnect(id, false);
    const attempt = (this.runtimes.get(id)?.attempt ?? 0) + 1;
    this.runtimes.set(id, { state: "connecting", tools: [], attempt });
    this.hooks.onChange();

    const current = () => this.runtimes.get(id)?.attempt === attempt;
    try {
      const client =
        config.kind === "local"
          ? await this.connectLocal(config)
          : await this.connectRemote(config, interactive, () => {
              if (current()) this.setState(id, "signing-in");
            });
      if (!client) {
        if (current()) {
          this.setState(
            id,
            "needs-auth",
            interactive ? "Sign-in did not finish" : undefined
          );
        }
        return;
      }
      const listed = await withTimeout(
        client.listTools(),
        CONNECT_TIMEOUT_MS,
        "Listing tools"
      );
      if (!current()) {
        await client.close().catch(() => {});
        return;
      }
      this.runtimes.set(id, {
        state: "connected",
        client,
        tools: listed.tools as RawTool[],
        attempt,
      });
      console.log(
        `[Connectors] ${id}: connected, ${listed.tools.length} tools`
      );
      this.hooks.onChange();
    } catch (error) {
      console.error(`[Connectors] ${id}: could not connect:`, error);
      if (!current()) return;
      if (error instanceof UnauthorizedError) {
        this.setState(
          id,
          "needs-auth",
          interactive ? message(error) : undefined
        );
      } else {
        this.setState(id, "error", message(error));
      }
    }
  }

  private async connectLocal(
    config: Extract<ConnectorConfig, { kind: "local" }>
  ): Promise<Client> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: {
        ...getDefaultEnvironment(),
        ...(this.store.getSecrets(config.id).env ?? {}),
      },
      cwd: os.homedir(),
      stderr: "pipe",
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    const client = newClient();
    try {
      await withTimeout(
        client.connect(transport),
        CONNECT_TIMEOUT_MS,
        "Starting the server"
      );
    } catch (error) {
      await transport.close().catch(() => {});
      const detail = stderr.trim().split("\n").slice(-3).join(" ");
      throw new Error(detail ? `${message(error)}: ${detail}` : message(error));
    }
    return client;
  }

  /**
   * Connects to an online server, signing in first if it asks and someone
   * is there to. Null when it needs a sign-in that did not happen.
   */
  private async connectRemote(
    config: Extract<ConnectorConfig, { kind: "remote" }>,
    interactive: boolean,
    onSigningIn: () => void
  ): Promise<Client | null> {
    const url = new URL(config.url);
    const secrets = this.store.getSecrets(config.id);
    const headers: Record<string, string> = secrets.token
      ? { Authorization: `Bearer ${secrets.token}` }
      : {};

    if (config.auth !== "oauth") {
      return this.openRemote(url, { requestInit: { headers } });
    }

    const loopback = interactive
      ? await startLoopback(secrets.oauth?.redirectPort)
      : null;
    if (loopback) this.signIns.set(config.id, loopback);
    try {
      const port = loopback?.port ?? secrets.oauth?.redirectPort ?? 0;
      const provider = new ConnectorOAuth(
        config.id,
        this.store,
        port,
        interactive ? this.hooks.openExternal : null
      );
      try {
        return await this.openRemote(url, { authProvider: provider });
      } catch (error) {
        if (
          !(error instanceof UnauthorizedError) ||
          !loopback ||
          !provider.authorizationUrl
        ) {
          if (error instanceof UnauthorizedError && !interactive) return null;
          throw error;
        }
      }
      onSigningIn();
      const code = await loopback.waitForCode(
        () => provider.pendingState,
        SIGN_IN_TIMEOUT_MS
      );
      const finishing = new StreamableHTTPClientTransport(url, {
        authProvider: provider,
      });
      await finishing.finishAuth(code);
      return await this.openRemote(url, { authProvider: provider });
    } finally {
      loopback?.close();
      if (loopback && this.signIns.get(config.id) === loopback) {
        this.signIns.delete(config.id);
      }
    }
  }

  /** Streamable HTTP, or the older SSE transport for addresses ending in /sse */
  private async openRemote(
    url: URL,
    options: ConstructorParameters<typeof StreamableHTTPClientTransport>[1]
  ): Promise<Client> {
    const sse = /\/sse\/?$/.test(url.pathname);
    const transport: Transport = sse
      ? new SSEClientTransport(url, options)
      : new StreamableHTTPClientTransport(url, options);
    const client = newClient();
    try {
      await withTimeout(
        client.connect(transport),
        CONNECT_TIMEOUT_MS,
        "Connecting"
      );
    } catch (error) {
      await transport.close().catch(() => {});
      throw error;
    }
    return client;
  }

  async disconnect(id: string, notify = true): Promise<void> {
    // A sign-in waiting in the browser is abandoned with the connector
    this.signIns.get(id)?.close();
    this.signIns.delete(id);
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    const client = runtime.client;
    this.runtimes.set(id, {
      state: "off",
      tools: [],
      attempt: runtime.attempt + 1,
    });
    if (client) {
      await client
        .close()
        .catch((error: unknown) =>
          console.error(`[Connectors] ${id}: error closing:`, error)
        );
    }
    if (notify) this.hooks.onChange();
  }

  async shutdown(): Promise<void> {
    await Promise.all(
      [...this.runtimes.keys()].map((id) => this.disconnect(id, false))
    );
  }

  private setState(id: string, state: ConnectorState, error?: string): void {
    const runtime = this.runtimes.get(id);
    this.runtimes.set(id, {
      state,
      tools: state === "connected" ? (runtime?.tools ?? []) : [],
      attempt: runtime?.attempt ?? 0,
      ...(runtime?.client && state === "connected"
        ? { client: runtime.client }
        : {}),
      ...(error ? { error } : {}),
    });
    this.hooks.onChange();
  }
}
