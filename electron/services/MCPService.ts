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
import { app } from "electron";
import {
  OFFICIAL_MCP_SERVERS,
  validateFilesystemPath,
  type MCPServerConfig,
  type MCPToolCall,
  type MCPToolResult,
} from "./MCPServerConfig.js";

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

    console.log("[MCPService] Initializing MCP service...");

    try {
      // Connect to filesystem server
      await this.connectToServer("filesystem");

      this.isInitialized = true;
      console.log("[MCPService] MCP service initialized successfully");
    } catch (error) {
      console.error("[MCPService] Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Connect to an MCP server
   */
  private async connectToServer(serverName: string): Promise<void> {
    const config = OFFICIAL_MCP_SERVERS[serverName];
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
    const config = OFFICIAL_MCP_SERVERS[serverName];
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
      // Expand tilde paths in arguments
      const expandedArgs = { ...args };
      if (expandedArgs.path && typeof expandedArgs.path === "string") {
        expandedArgs.path = expandTildePath(expandedArgs.path);
      }

      // Validate path restrictions for filesystem operations
      if (serverName === "filesystem") {
        const validated = validateFilesystemPath(expandedArgs, config);
        if (!validated.success) {
          return validated;
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
    return result.tools || [];
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
    return OFFICIAL_MCP_SERVERS[serverName];
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
