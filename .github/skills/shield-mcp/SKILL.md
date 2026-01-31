---
name: shield-mcp
description: Model Context Protocol (MCP) integration for SHIELD 2.0. Use this when working with MCP tools, servers, or tool-calling functionality.
---

# SHIELD 2.0 MCP Integration

## Overview

SHIELD integrates MCP (Model Context Protocol) to enable AI tool calling with user permission controls.

## Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│   LLM Chat   │────►│ MCP Service │────►│ MCP Servers  │
│   Session    │     │  (Client)   │     │ (Filesystem) │
└──────────────┘     └─────────────┘     └──────────────┘
                            │
                     ┌──────┴──────┐
                     │  Permission │
                     │   Dialog    │
                     └─────────────┘
```

## MCP Service Pattern

```typescript
// electron/services/MCPService.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

export class MCPService {
  private client: Client | null = null;

  async initialize() {
    this.client = new Client({
      name: "shield-client",
      version: "1.0.0",
    });
  }

  async callTool(name: string, args: Record<string, unknown>) {
    if (!this.client) throw new Error("MCP not initialized");
    return await this.client.callTool({ name, arguments: args });
  }

  async listTools() {
    if (!this.client) return [];
    const result = await this.client.listTools();
    return result.tools;
  }
}
```

## Permission System

All MCP tool calls require explicit user approval:

```typescript
interface PermissionRequest {
  toolName: string;
  args: Record<string, unknown>;
  description: string;
}

// Show permission dialog before executing
async function handleToolCall(request: PermissionRequest) {
  const approved = await showPermissionDialog(request);
  if (!approved) {
    return { denied: true };
  }
  return await mcpService.callTool(request.toolName, request.args);
}
```

## File Operations

Filesystem MCP server with path restrictions:

```typescript
// Allowed paths (user configurable)
const allowedPaths = [
  path.join(os.homedir(), "Documents"),
  path.join(os.homedir(), "Desktop"),
];

// Validate path before operation
function validatePath(targetPath: string): boolean {
  const normalized = path.normalize(targetPath);
  return allowedPaths.some((allowed) => normalized.startsWith(allowed));
}
```

## Tool Response Handling

```typescript
interface ToolResult {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

function formatToolResult(result: ToolResult): string {
  if (result.isError) {
    return `Error: ${result.content[0]?.text || "Unknown error"}`;
  }

  return result.content
    .map((c) => {
      if (c.type === "text") return c.text;
      if (c.type === "resource") return `[Resource: ${c.mimeType}]`;
      return "[Content]";
    })
    .join("\n");
}
```

## System Prompt for Tool Calling

```typescript
const MCP_SYSTEM_PROMPT = `You have access to tools via MCP (Model Context Protocol).

Available tools will be provided in the conversation context.

When using tools:
1. Explain what you're about to do
2. Wait for user approval
3. Report the results clearly

Never attempt to:
- Access files outside allowed directories
- Execute system commands without explicit permission
- Modify critical system files`;
```

## IPC Handlers

```typescript
// electron/ipc/mcpHandlers.ts
ipcMain.handle("mcp:callTool", async (_event, name: string, args: any) => {
  try {
    const result = await mcpService.callTool(name, args);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("mcp:listTools", async () => {
  return await mcpService.listTools();
});
```

## Settings Integration

```typescript
interface MCPSettings {
  enabled: boolean;
  allowedPaths: string[];
  requireApproval: boolean; // Always true for security
  servers: MCPServerConfig[];
}

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}
```
