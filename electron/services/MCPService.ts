/**
 * MCP Service
 *
 * Manages Model Context Protocol server lifecycle and client communication.
 * Security-first approach with official servers only, path restrictions,
 * and explicit user approval for all operations.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import os from "os";
import { app, shell } from "electron";
import fsPromises from "fs/promises";
import {
  OFFICIAL_MCP_SERVERS,
  resolveToolPaths,
  validateFilesystemPath,
  type MCPServerConfig,
  type MCPToolCall,
  type MCPToolResult,
} from "./MCPServerConfig.js";
import {
  DELETE_TOOL,
  DELETE_TOOL_NAME,
  moveToRecycleBin,
} from "./recycleBin.js";

/**
 * Expand tilde (~) in paths to actual home directory
 */
function expandTildePath(filepath: string): string {
  if (filepath.startsWith("~/") || filepath.startsWith("~\\")) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

/**
 * MCP Service Class
 * Singleton service for managing MCP server connections
 */
class MCPService {
  private static instance: MCPService | null = null;
  private clients: Map<string, Client> = new Map();
  private isInitialized = false;
  /** In-flight initialize(), shared by concurrent callers */
  private initializing: Promise<void> | null = null;
  /** Folder the user chose for file tools; null means the default folders */
  private workspaceFolder: string | null = null;

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {}

  /**
   * Get MCPService singleton instance
   */
  public static getInstance(): MCPService {
    if (!MCPService.instance) {
      MCPService.instance = new MCPService();
    }
    return MCPService.instance;
  }

  /**
   * Initialize MCP service and connect to official servers
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log("[MCPService] Already initialized");
      return;
    }

    // The renderer asks from more than one place at startup. Without this,
    // concurrent calls each started a filesystem server and the first one
    // was left running, orphaned.
    this.initializing ??= this.connectToServer("filesystem")
      .then(() => {
        this.isInitialized = true;
        console.log("[MCPService] MCP service initialized successfully");
      })
      .catch((error: unknown) => {
        console.error("[MCPService] Failed to initialize:", error);
        throw error;
      })
      .finally(() => {
        this.initializing = null;
      });

    return this.initializing;
  }

  /**
   * Connect to an MCP server
   */
  private async connectToServer(serverName: string): Promise<void> {
    const config = this.effectiveConfig(serverName);
    if (!config) {
      throw new Error(`Unknown MCP server: ${serverName}`);
    }

    console.log(`[MCPService] Connecting to ${serverName} server...`);

    try {
      // Get the server executable path
      const serverPath = this.getServerPath(config.package);

      // For filesystem server, pass allowed paths as command-line arguments
      const serverArgs =
        serverName === "filesystem"
          ? [serverPath, ...config.allowedPaths]
          : [serverPath];

      console.log(`[MCPService] Starting server with args:`, serverArgs);

      // Create client with stdio transport
      const transport = new StdioClientTransport({
        command: "node",
        args: serverArgs,
        // Anything the server resolves itself starts in the user's folder
        ...(serverName === "filesystem"
          ? { cwd: this.baseFolder(config) }
          : {}),
      });

      const client = new Client(
        {
          name: "shield-mcp-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect client to transport
      await client.connect(transport);

      // Store client reference
      this.clients.set(serverName, client);

      console.log(`[MCPService] Connected to ${serverName} server`);
    } catch (error) {
      console.error(`[MCPService] Failed to connect to ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Get the path to an installed MCP server package
   */
  private getServerPath(packageName: string): string {
    // In production, look in app's node_modules
    const appPath = app.isPackaged
      ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules")
      : path.join(process.cwd(), "node_modules");

    // Path to server executable (typically dist/index.js or similar)
    return path.join(appPath, packageName, "dist", "index.js");
  }

  /**
   * Call an MCP tool with security checks
   */
  public async callTool(request: MCPToolCall): Promise<MCPToolResult> {
    if (!this.isInitialized) {
      throw new Error("MCP service not initialized");
    }

    const { serverName, tool, arguments: args } = request;

    // Verify server is in whitelist
    const config = this.effectiveConfig(serverName);
    if (!config) {
      return {
        success: false,
        error: `Server ${serverName} is not in whitelist`,
      };
    }

    // Get client for server
    const client = this.clients.get(serverName);
    if (!client) {
      return {
        success: false,
        error: `Not connected to ${serverName} server`,
      };
    }

    try {
      // Expand ~ and make relative paths ("." = the user's folder) absolute
      // against the workspace, not the process's own directory
      let expandedArgs: Record<string, unknown> = { ...args };
      if (serverName === "filesystem") {
        for (const key of ["path", "source", "destination"]) {
          if (typeof expandedArgs[key] === "string") {
            expandedArgs[key] = expandTildePath(expandedArgs[key] as string);
          }
        }
        expandedArgs = resolveToolPaths(expandedArgs, this.baseFolder(config));
      }

      // Validate path restrictions for filesystem operations
      if (serverName === "filesystem") {
        const validated = validateFilesystemPath(expandedArgs, config);
        if (!validated.success) {
          return validated;
        }

        // SHIELD's own tool - the server has no delete. Runs only after the
        // same path checks as every server tool.
        if (tool === DELETE_TOOL_NAME) {
          return moveToRecycleBin(expandedArgs.path, config.allowedPaths, {
            exists: (target) =>
              fsPromises.stat(target).then(
                () => true,
                () => false
              ),
            trash: (target) => shell.trashItem(target),
          });
        }
      }

      // Call tool through MCP client
      const result = await client.callTool({
        name: tool,
        arguments: expandedArgs,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error(`[MCPService] Tool call failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * List available tools from a server
   */
  public async listTools(serverName: string): Promise<unknown[]> {
    if (!this.isInitialized) {
      throw new Error("MCP service not initialized");
    }

    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`Not connected to ${serverName} server`);
    }

    const result = await client.listTools();
    const tools = result.tools || [];
    // The filesystem server cannot delete; SHIELD adds a Recycle Bin delete
    return serverName === "filesystem" ? [...tools, DELETE_TOOL] : tools;
  }

  /**
   * Shutdown MCP service and disconnect from all servers
   */
  public async shutdown(): Promise<void> {
    console.log("[MCPService] Shutting down...");

    // Close all clients
    for (const [serverName, client] of this.clients.entries()) {
      try {
        await client.close();
        console.log(`[MCPService] Disconnected from ${serverName}`);
      } catch (error) {
        console.error(`[MCPService] Error closing ${serverName}:`, error);
      }
    }

    this.clients.clear();
    this.isInitialized = false;

    console.log("[MCPService] Shutdown complete");
  }

  /**
   * Get server configuration
   */
  public getServerConfig(serverName: string): MCPServerConfig | undefined {
    return this.effectiveConfig(serverName);
  }

  /**
   * A server's config with the user's workspace applied: when a folder has
   * been chosen, the filesystem server may touch that folder and nothing
   * else. Everything that checks or starts a server goes through here.
   */
  private effectiveConfig(serverName: string): MCPServerConfig | undefined {
    const config = OFFICIAL_MCP_SERVERS[serverName];
    if (!config || serverName !== "filesystem" || !this.workspaceFolder) {
      return config;
    }
    return { ...config, allowedPaths: [this.workspaceFolder] };
  }

  public getWorkspaceFolder(): string | null {
    return this.workspaceFolder;
  }

  /** Where relative paths point: the workspace, else the first default */
  private baseFolder(config: MCPServerConfig): string {
    return this.workspaceFolder ?? config.allowedPaths[0] ?? os.homedir();
  }

  /**
   * Point file tools at a folder, or back at the defaults with null.
   *
   * The filesystem server takes its folders on the command line, so a
   * running server is restarted to pick the change up.
   */
  public async setWorkspaceFolder(folder: string | null): Promise<void> {
    const next = folder ? path.resolve(folder) : null;
    if (next === this.workspaceFolder) return;

    this.workspaceFolder = next;
    console.log(`[MCPService] Workspace folder: ${next ?? "default folders"}`);

    const client = this.clients.get("filesystem");
    if (!client) return; // Not started yet - initialize() will use it

    this.clients.delete("filesystem");
    try {
      await client.close();
    } catch (error) {
      console.error("[MCPService] Error closing filesystem server:", error);
    }
    await this.connectToServer("filesystem");
  }

  /**
   * Get the names of servers we currently hold a live connection to
   */
  public getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if service is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const mcpService = MCPService.getInstance();
export type { MCPToolCall, MCPToolResult, MCPServerConfig };
