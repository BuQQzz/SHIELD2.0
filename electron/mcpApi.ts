import { ipcRenderer } from "electron";
import type { MCPAPI, MCPToolCall } from "../src/types/electron";

export const mcpAPI: MCPAPI = {
  initialize: () => ipcRenderer.invoke("mcp:initialize"),
  callTool: (request: MCPToolCall) =>
    ipcRenderer.invoke("mcp:call-tool", request),
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
