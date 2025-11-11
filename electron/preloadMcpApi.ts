import { ipcRenderer } from "electron";
import type {
  MCPToolCall,
  MCPToolResult,
  MCPServerConfig,
} from "./services/MCPService";
import type {
  AuditLogEntry,
  AuditLogQueryOptions,
} from "./services/AuditLogService";

export interface MCPAPI {
  initialize: () => Promise<{ success: boolean; error?: string }>;
  callTool: (request: MCPToolCall) => Promise<MCPToolResult>;
  listTools: (
    serverName: string
  ) => Promise<{ success: boolean; tools?: unknown[]; error?: string }>;
  getServerConfig: (
    serverName: string
  ) => Promise<{ success: boolean; config?: MCPServerConfig; error?: string }>;
  isReady: () => Promise<{ success: boolean; ready?: boolean; error?: string }>;
  audit: {
    query: (
      options?: AuditLogQueryOptions
    ) => Promise<{ success: boolean; logs?: AuditLogEntry[]; error?: string }>;
    stats: () => Promise<{
      success: boolean;
      stats?: {
        totalCalls: number;
        approvedCalls: number;
        deniedCalls: number;
        byServer: Record<string, number>;
        byTool: Record<string, number>;
      };
      error?: string;
    }>;
    export: (
      outputPath: string
    ) => Promise<{ success: boolean; error?: string }>;
    clear: () => Promise<{ success: boolean; error?: string }>;
  };
}

export const mcpAPI: MCPAPI = {
  initialize: () => ipcRenderer.invoke("mcp:initialize"),
  callTool: (request) => ipcRenderer.invoke("mcp:call-tool", request),
  listTools: (serverName) => ipcRenderer.invoke("mcp:list-tools", serverName),
  getServerConfig: (serverName) =>
    ipcRenderer.invoke("mcp:get-server-config", serverName),
  isReady: () => ipcRenderer.invoke("mcp:is-ready"),
  audit: {
    query: (options) => ipcRenderer.invoke("mcp:audit-query", options),
    stats: () => ipcRenderer.invoke("mcp:audit-stats"),
    export: (outputPath) => ipcRenderer.invoke("mcp:audit-export", outputPath),
    clear: () => ipcRenderer.invoke("mcp:audit-clear"),
  },
};
