import { useState, useEffect } from "react";
import type { MCPToolCall, MCPToolResult, AuditLogEntry } from "@/types/electron";

/**
 * Hook for interacting with MCP (Model Context Protocol) services
 * Provides access to MCP operations with permission management
 */
export function useMCP() {
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if MCP is ready on mount
    const checkReady = async () => {
      try {
        const result = await window.electronAPI.mcp.isReady();
        setIsReady(result.ready ?? false);
      } catch (err) {
        console.error("Failed to check MCP readiness:", err);
        setIsReady(false);
      }
    };

    checkReady();

    // Poll for MCP readiness every 2 seconds to catch initialization from other components
    const interval = setInterval(checkReady, 2000);

    return () => clearInterval(interval);
  }, []);

  /**
   * Initialize the MCP service
   */
  const initialize = async () => {
    setIsInitializing(true);
    setError(null);

    try {
      const result = await window.electronAPI.mcp.initialize();
      if (result.success) {
        setIsReady(true);
      } else {
        setError(result.error ?? "Failed to initialize MCP");
      }
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsInitializing(false);
    }
  };

  /**
   * Call an MCP tool with the given request
   */
  const callTool = async (request: MCPToolCall): Promise<MCPToolResult> => {
    try {
      return await window.electronAPI.mcp.callTool(request);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  };

  /**
   * List available tools for a specific MCP server
   */
  const listTools = async (serverName: string) => {
    try {
      return await window.electronAPI.mcp.listTools(serverName);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  };

  /**
   * Get the configuration for a specific MCP server
   */
  const getServerConfig = async (serverName: string) => {
    try {
      return await window.electronAPI.mcp.getServerConfig(serverName);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  };

  /**
   * Query audit logs with optional filters
   */
  const queryAuditLogs = async (options?: {
    serverName?: string;
    toolName?: string;
    startDate?: Date;
    endDate?: Date;
    approved?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> => {
    try {
      const result = await window.electronAPI.mcp.audit.query(options);
      return result.logs ?? [];
    } catch (err) {
      console.error("Failed to query audit logs:", err);
      return [];
    }
  };

  /**
   * Get audit statistics
   */
  const getAuditStats = async () => {
    try {
      return await window.electronAPI.mcp.audit.stats();
    } catch (err) {
      console.error("Failed to get audit stats:", err);
      return { success: false, error: "Failed to get audit stats" };
    }
  };

  /**
   * Export audit logs to a file
   */
  const exportAuditLogs = async (filePath: string) => {
    try {
      return await window.electronAPI.mcp.audit.export(filePath);
    } catch (err) {
      console.error("Failed to export audit logs:", err);
      return { success: false, error: "Failed to export audit logs" };
    }
  };

  /**
   * Clear all audit logs
   */
  const clearAuditLogs = async () => {
    try {
      return await window.electronAPI.mcp.audit.clear();
    } catch (err) {
      console.error("Failed to clear audit logs:", err);
      return { success: false, error: "Failed to clear audit logs" };
    }
  };

  return {
    isReady,
    isInitializing,
    error,
    initialize,
    callTool,
    listTools,
    getServerConfig,
    audit: {
      query: queryAuditLogs,
      stats: getAuditStats,
      export: exportAuditLogs,
      clear: clearAuditLogs,
    },
  };
}
