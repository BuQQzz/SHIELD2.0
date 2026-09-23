import {
  BrowserWindow,
  dialog,
  ipcMain,
  type OpenDialogOptions,
} from "electron";
import fs from "fs/promises";
import path from "path";
import { mcpService } from "../services/MCPService.js";
import { auditLogService } from "../services/AuditLogService.js";

/**
 * Register all MCP (Model Context Protocol) related IPC handlers
 */
export async function registerMcpHandlers() {
  // Initialize MCP and audit log services
  ipcMain.handle("mcp:initialize", async () => {
    try {
      await auditLogService.initialize();
      await mcpService.initialize();
      return { success: true };
    } catch (error) {
      console.error("Failed to initialize MCP:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Call MCP tool
  ipcMain.handle("mcp:call-tool", async (_event, request) => {
    try {
      const result = await mcpService.callTool(request);

      // Log the tool call
      const logId = await auditLogService.logToolCall(
        request.serverName,
        request.tool,
        request.arguments,
        result.success
      );

      // Update log with result
      await auditLogService.updateLogResult(logId, result);

      return result;
    } catch (error) {
      console.error("Failed to call MCP tool:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // List available tools
  ipcMain.handle("mcp:list-tools", async (_event, serverName) => {
    try {
      const tools = await mcpService.listTools(serverName);
      return { success: true, tools };
    } catch (error) {
      console.error("Failed to list MCP tools:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get server configuration
  ipcMain.handle("mcp:list-servers", async () => {
    try {
      return { success: true, servers: mcpService.getConnectedServers() };
    } catch (error) {
      console.error("Failed to list MCP servers:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  ipcMain.handle("mcp:get-server-config", async (_event, serverName) => {
    try {
      const config = mcpService.getServerConfig(serverName);
      return { success: true, config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Ask the user for a workspace folder. Returns the path, or null if they
  // cancelled. Nothing changes until mcp:set-workspace is called with it.
  ipcMain.handle("mcp:choose-workspace", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
      title: "Choose a folder for SHIELD",
      message: "SHIELD's file tools will only be able to use this folder",
      defaultPath: mcpService.getWorkspaceFolder() ?? undefined,
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // Point file tools at a folder (or back to the defaults with null) and
  // wait for the filesystem server to restart with it.
  ipcMain.handle("mcp:set-workspace", async (_event, folder: unknown) => {
    try {
      if (folder !== null) {
        if (typeof folder !== "string" || !path.isAbsolute(folder)) {
          return { success: false, error: "Folder must be an absolute path" };
        }
        const stats = await fs.stat(folder).catch(() => null);
        if (!stats?.isDirectory()) {
          return { success: false, error: `Not a folder: ${folder}` };
        }
      }
      await mcpService.setWorkspaceFolder(folder);
      return { success: true, folder: mcpService.getWorkspaceFolder() };
    } catch (error) {
      console.error("Failed to set workspace folder:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Check if MCP is ready
  ipcMain.handle("mcp:is-ready", async () => {
    try {
      const ready = mcpService.isReady();
      return { success: true, ready };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Audit log query
  ipcMain.handle("mcp:audit-query", async (_event, options) => {
    try {
      const logs = await auditLogService.queryLogs(options);
      return { success: true, logs };
    } catch (error) {
      console.error("Failed to query audit logs:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get audit statistics
  ipcMain.handle("mcp:audit-stats", async () => {
    try {
      const stats = await auditLogService.getStatistics();
      return { success: true, stats };
    } catch (error) {
      console.error("Failed to get audit stats:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Export audit logs
  ipcMain.handle("mcp:audit-export", async (_event, outputPath) => {
    try {
      await auditLogService.exportLogs(outputPath);
      return { success: true };
    } catch (error) {
      console.error("Failed to export audit logs:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Clear audit logs
  ipcMain.handle("mcp:audit-clear", async () => {
    try {
      await auditLogService.clearLogs();
      return { success: true };
    } catch (error) {
      console.error("Failed to clear audit logs:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });
}
