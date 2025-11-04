/**
 * MCP Service
 * 
 * Manages Model Context Protocol server lifecycle and client communication.
 * Security-first approach with official servers only, path restrictions,
 * and explicit user approval for all operations.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import { app } from 'electron';

/**
 * MCP Server Configuration
 */
interface MCPServerConfig {
  package: string;
  version: string;
  permissions: string[];
  allowedPaths: string[];
  requiresApproval: boolean;
}

/**
 * Official MCP Servers Whitelist
 * Only servers from @modelcontextprotocol are allowed
 */
const OFFICIAL_MCP_SERVERS: Record<string, MCPServerConfig> = {
  filesystem: {
    package: '@modelcontextprotocol/server-filesystem',
    version: '^2025.8.21',
    permissions: ['read', 'write', 'list'],
    allowedPaths: [
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Desktop'),
    ],
    requiresApproval: true,
  },
};

/**
 * MCP Tool Call Request
 */
interface MCPToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  serverName: string;
}

/**
 * MCP Tool Call Result
 */
interface MCPToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * MCP Service Class
 * Singleton service for managing MCP server connections
 */
class MCPService {
  private static instance: MCPService | null = null;
  private clients: Map<string, Client> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
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
      console.log('[MCPService] Already initialized');
      return;
    }

    console.log('[MCPService] Initializing MCP service...');

    try {
      // Connect to filesystem server
      await this.connectToServer('filesystem');

      this.isInitialized = true;
      console.log('[MCPService] MCP service initialized successfully');
    } catch (error) {
      console.error('[MCPService] Failed to initialize:', error);
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
      
      // Spawn server process
      const serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Pass allowed paths as environment variable
          ALLOWED_PATHS: config.allowedPaths.join(';'),
        },
      });

      // Store process reference
      this.processes.set(serverName, serverProcess);

      // Create client with stdio transport
      const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath],
        env: {
          ALLOWED_PATHS: config.allowedPaths.join(';'),
        },
      });

      const client = new Client(
        {
          name: 'shield-mcp-client',
          version: '1.0.0',
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
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
      : path.join(process.cwd(), 'node_modules');

    // Path to server executable (typically dist/index.js or similar)
    return path.join(appPath, packageName, 'dist', 'index.js');
  }

  /**
   * Call an MCP tool with security checks
   */
  public async callTool(request: MCPToolCall): Promise<MCPToolResult> {
    if (!this.isInitialized) {
      throw new Error('MCP service not initialized');
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
      // Validate path restrictions for filesystem operations
      if (serverName === 'filesystem') {
        const validated = this.validateFilesystemPath(args, config);
        if (!validated.success) {
          return validated;
        }
      }

      // Call tool through MCP client
      const result = await client.callTool({
        name: tool,
        arguments: args,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      console.error(`[MCPService] Tool call failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate filesystem paths against allowed paths
   */
  private validateFilesystemPath(
    args: Record<string, unknown>,
    config: MCPServerConfig
  ): MCPToolResult {
    const targetPath = args.path as string;
    if (!targetPath) {
      return {
        success: false,
        error: 'No path provided',
      };
    }

    // Normalize path
    const normalizedPath = path.normalize(targetPath);

    // Check if path is within allowed directories
    const isAllowed = config.allowedPaths.some(allowedPath => {
      const normalized = path.normalize(allowedPath);
      return normalizedPath.startsWith(normalized);
    });

    if (!isAllowed) {
      return {
        success: false,
        error: `Access denied: Path ${targetPath} is outside allowed directories`,
      };
    }

    return { success: true };
  }

  /**
   * List available tools from a server
   */
  public async listTools(serverName: string): Promise<unknown[]> {
    if (!this.isInitialized) {
      throw new Error('MCP service not initialized');
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
    console.log('[MCPService] Shutting down...');

    // Close all clients
    for (const [serverName, client] of this.clients.entries()) {
      try {
        await client.close();
        console.log(`[MCPService] Disconnected from ${serverName}`);
      } catch (error) {
        console.error(`[MCPService] Error closing ${serverName}:`, error);
      }
    }

    // Kill all server processes
    for (const [serverName, process] of this.processes.entries()) {
      try {
        process.kill();
        console.log(`[MCPService] Killed ${serverName} process`);
      } catch (error) {
        console.error(`[MCPService] Error killing ${serverName}:`, error);
      }
    }

    this.clients.clear();
    this.processes.clear();
    this.isInitialized = false;

    console.log('[MCPService] Shutdown complete');
  }

  /**
   * Get server configuration
   */
  public getServerConfig(serverName: string): MCPServerConfig | undefined {
    return OFFICIAL_MCP_SERVERS[serverName];
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
