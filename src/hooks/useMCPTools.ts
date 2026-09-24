/**
 * MCP Tools Hook
 *
 * Fetches the tools actually exposed by the connected MCP servers and maps
 * them into the ToolDefinition shape the prompt builder expects.
 *
 * Before this existed the prompt builder fell back to a hardcoded list of
 * three filesystem tools, so the model was never told about the rest of the
 * filesystem server's tools, or about any other server's tools at all.
 */

import { useState, useEffect } from "react";
import type { ToolDefinition, ToolParameter } from "@/types/prompts";

/** Shape of a tool as returned by an MCP server's tools/list */
interface MCPToolSchema {
  name?: string;
  description?: string;
  inputSchema?: {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  annotations?: {
    readOnlyHint?: boolean;
  };
}

const PARAM_TYPES: ToolParameter["type"][] = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
];

function toParamType(value: unknown): ToolParameter["type"] {
  if (typeof value === "string") {
    if ((PARAM_TYPES as string[]).includes(value)) {
      return value as ToolParameter["type"];
    }
    // JSON Schema "integer" has no ToolParameter equivalent
    if (value === "integer") return "number";
  }
  return "string";
}

/**
 * "Each item: {oldText (string, required), newText (string, required)}" for
 * an array of objects, else "".
 *
 * The prompt showed edit_file's `edits` only as "array", so Qwen3-Coder
 * guessed {"replace", "with"}, every edit failed, and it rewrote whole files
 * with write_file instead (2026-09-24).
 */
export function describeArrayItems(schema: Record<string, unknown>): string {
  if (schema.type !== "array") return "";
  const items = schema.items as
    { properties?: Record<string, unknown>; required?: string[] } | undefined;
  const properties = items?.properties;
  if (!properties) return "";

  const fields = Object.entries(properties).map(([key, raw]) => {
    const type = (raw as { type?: unknown } | null)?.type;
    const parts = [typeof type === "string" ? type : "any"];
    if (items.required?.includes(key)) parts.push("required");
    return `${key} (${parts.join(", ")})`;
  });
  return `Each item: {${fields.join(", ")}}`;
}

function toToolDefinition(
  serverName: string,
  tool: MCPToolSchema
): ToolDefinition | null {
  if (!tool.name) return null;

  const properties = tool.inputSchema?.properties ?? {};
  const required = tool.inputSchema?.required ?? [];

  const parameters: ToolParameter[] = Object.entries(properties).map(
    ([name, rawSchema]) => {
      const schema = (
        typeof rawSchema === "object" && rawSchema !== null ? rawSchema : {}
      ) as Record<string, unknown>;

      const description =
        typeof schema.description === "string" ? schema.description : "";
      const itemShape = describeArrayItems(schema);

      return {
        name,
        type: toParamType(schema.type),
        description: itemShape
          ? `${description}${description ? " " : ""}${itemShape}`
          : description,
        required: required.includes(name),
      };
    }
  );

  return {
    name: tool.name,
    description: tool.description ?? "",
    serverName,
    parameters,
    // Carried through so the classifier can prefer the server's own claim
    // over our local list. No server supplies this yet.
    ...(typeof tool.annotations?.readOnlyHint === "boolean"
      ? { annotations: { readOnlyHint: tool.annotations.readOnlyHint } }
      : {}),
  };
}

/**
 * Returns the live tool list across every connected MCP server.
 * Re-fetches whenever MCP readiness changes.
 *
 * `settled` means "we have finished an attempt for the current readiness
 * state". Callers must wait for it before deciding the tool list is empty,
 * otherwise they act on the initial [] and conclude there are no tools.
 */
export function useMCPTools(isMCPReady: boolean, workspaceFolder?: string) {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!isMCPReady) {
      setTools([]);
      setAllowedPaths([]);
      setSettled(true);
      return;
    }

    let cancelled = false;
    setSettled(false);

    const loadTools = async () => {
      try {
        const serverResult = await window.electronAPI.mcp.listServers();
        if (!serverResult.success || !serverResult.servers) {
          console.error(
            "[useMCPTools] Failed to list MCP servers:",
            serverResult.error
          );
          if (!cancelled) setTools([]);
          return;
        }

        const collected: ToolDefinition[] = [];
        const roots: string[] = [];

        for (const serverName of serverResult.servers) {
          const configResult =
            await window.electronAPI.mcp.getServerConfig(serverName);
          if (configResult.success && configResult.config?.allowedPaths) {
            roots.push(...configResult.config.allowedPaths);
          }

          const toolResult = await window.electronAPI.mcp.listTools(serverName);

          if (!toolResult.success || !toolResult.tools) {
            console.warn(
              `[useMCPTools] Could not list tools for ${serverName}:`,
              toolResult.error
            );
            continue;
          }

          for (const rawTool of toolResult.tools) {
            const definition = toToolDefinition(
              serverName,
              rawTool as MCPToolSchema
            );
            if (definition) collected.push(definition);
          }
        }

        if (cancelled) return;

        console.log(
          `[useMCPTools] Loaded ${collected.length} tools from ${serverResult.servers.length} server(s):`,
          collected.map((t) => `${t.serverName}.${t.name}`)
        );
        setTools(collected);
        setAllowedPaths(Array.from(new Set(roots)));
      } catch (error) {
        console.error("[useMCPTools] Error loading MCP tools:", error);
        if (!cancelled) setTools([]);
      } finally {
        if (!cancelled) setSettled(true);
      }
    };

    loadTools();

    return () => {
      cancelled = true;
    };
    // A new workspace restarts the filesystem server with different folders
  }, [isMCPReady, workspaceFolder]);

  return { tools, allowedPaths, settled };
}
