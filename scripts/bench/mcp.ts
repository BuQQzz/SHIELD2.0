/**
 * Benchmark MCP plumbing: a real filesystem MCP server pointed at a
 * throwaway fixture directory, plus the Auto/deny policy the tasks run under.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { isMutatingTool } from "../../src/config/toolClassification";
import type { ToolDefinition, ToolParameter } from "../../src/types/prompts";

const require = createRequire(import.meta.url);

export const SERVER_NAME = "filesystem";

export interface RawMCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
}

export interface CallRecord {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  blocked: boolean;
  duplicate: boolean;
  error?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  blocked?: boolean;
}

export function createFixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shield-bench-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  // The server canonicalises paths; hand the model the same form it will see.
  return fs.realpathSync.native(dir);
}

/** Same mapping as useMCPTools, which is not importable outside React. */
export function toToolDefinition(tool: RawMCPTool): ToolDefinition {
  const properties =
    (tool.inputSchema?.properties as Record<string, Record<string, unknown>>) ??
    {};
  const required = (tool.inputSchema?.required as string[]) ?? [];
  const types: ToolParameter["type"][] = [
    "string",
    "number",
    "boolean",
    "object",
    "array",
  ];

  return {
    name: tool.name,
    description: tool.description ?? "",
    serverName: SERVER_NAME,
    parameters: Object.entries(properties).map(([name, schema]) => ({
      name,
      type:
        schema?.type === "integer"
          ? "number"
          : types.includes(schema?.type as ToolParameter["type"])
            ? (schema.type as ToolParameter["type"])
            : "string",
      description:
        typeof schema?.description === "string" ? schema.description : "",
      required: required.includes(name),
    })),
    ...(typeof tool.annotations?.readOnlyHint === "boolean"
      ? { annotations: { readOnlyHint: tool.annotations.readOnlyHint } }
      : {}),
  };
}

export interface BenchMCP {
  rawTools: RawMCPTool[];
  toolDefs: ToolDefinition[];
  calls: CallRecord[];
  /** Runs one call through policy + MCP, recording it. Never throws. */
  execute(
    serverName: string,
    tool: string,
    args: Record<string, unknown>
  ): Promise<ToolResult>;
  close(): Promise<void>;
}

export async function startMCP(
  fixtureDir: string,
  opts: { denyMutations: boolean }
): Promise<BenchMCP> {
  const serverPath = require.resolve(
    "@modelcontextprotocol/server-filesystem/dist/index.js"
  );
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverPath, fixtureDir],
    stderr: "ignore",
  });
  const client = new Client(
    { name: "shield-bench", version: "0.0.1" },
    { capabilities: {} }
  );
  await client.connect(transport);

  const rawTools = ((await client.listTools()).tools ?? []) as RawMCPTool[];
  const toolDefs = rawTools.map(toToolDefinition);
  const calls: CallRecord[] = [];
  const seen = new Set<string>();

  const execute: BenchMCP["execute"] = async (serverName, tool, args) => {
    const signature = `${tool}:${JSON.stringify(args)}`;
    const record: CallRecord = {
      tool,
      args,
      ok: false,
      blocked: false,
      duplicate: seen.has(signature),
    };
    seen.add(signature);
    calls.push(record);

    const finish = (result: ToolResult): ToolResult => {
      record.ok = result.success;
      record.blocked = !!result.blocked;
      record.error = result.error;
      return result;
    };

    // Mirrors MCPService: unknown servers are rejected before anything runs.
    if (serverName !== SERVER_NAME) {
      return finish({
        success: false,
        error: `Server ${serverName} is not in whitelist`,
      });
    }

    const def = toolDefs.find((t) => t.name === tool);
    if (!def) {
      return finish({ success: false, error: `Unknown tool: ${tool}` });
    }

    // Auto mode auto-approves in the benchmark (we are measuring the model,
    // not the user); deny tasks model the user refusing a mutation.
    if (opts.denyMutations && isMutatingTool(def)) {
      return finish({
        success: false,
        blocked: true,
        error: `Permission denied: the user did not allow ${tool}.`,
      });
    }

    try {
      const result = await client.callTool({ name: tool, arguments: args });
      if (result.isError) {
        const text = (result.content as Array<{ text?: string }>)
          ?.map((c) => c.text ?? "")
          .join("\n");
        return finish({ success: false, error: text || "Tool error" });
      }
      return finish({ success: true, data: result });
    } catch (error) {
      return finish({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return {
    rawTools,
    toolDefs,
    calls,
    execute,
    close: () => client.close(),
  };
}

/** Plain text of an MCP result, for backends that take a string result. */
export function resultText(result: ToolResult): string {
  if (!result.success) return `Error: ${result.error ?? "unknown error"}`;
  const content = (result.data as { content?: Array<{ text?: string }> })
    ?.content;
  return content?.map((c) => c.text ?? "").join("\n") ?? "";
}
