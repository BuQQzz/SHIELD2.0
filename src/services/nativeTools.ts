import type { ChatModelFunctions, GbnfJsonSchema } from "node-llama-cpp";
import type { ToolDefinition } from "../types/prompts";

type JsonObject = Record<string, unknown>;

// Declarations retain the original MCP schema. Gemma emits its own native
// parameter syntax, so optional fields can be omitted without null placeholders.
function inputSchema(tool: ToolDefinition): JsonObject {
  return (
    tool.inputSchema ?? {
      type: "object",
      properties: Object.fromEntries(
        (tool.parameters ?? []).map((p) => [
          p.name,
          { type: p.type, description: p.description },
        ])
      ),
      required: (tool.parameters ?? [])
        .filter((p) => p.required)
        .map((p) => p.name),
      additionalProperties: false,
    }
  );
}

function nameHash(identity: string): string {
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) {
    hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Native function definitions contain no handlers: execution remains in SHIELD. */
export function buildNativeTools(tools: ToolDefinition[]): {
  functions: ChatModelFunctions;
  toolsByName: Map<string, ToolDefinition>;
} {
  const entries = tools.map((tool) => {
    const identity = JSON.stringify([
      tool.serverName ?? "filesystem",
      tool.name,
    ]);
    const rawName = `${tool.serverName ?? "filesystem"}__${tool.name}`;
    const sanitized = rawName.replace(/[^A-Za-z0-9_]/g, "_");
    return {
      tool,
      identity,
      base: /^[A-Za-z_]/.test(sanitized) ? sanitized : `tool_${sanitized}`,
    };
  });
  entries.sort((a, b) =>
    a.identity < b.identity ? -1 : a.identity > b.identity ? 1 : 0
  );
  const bases = new Map<string, number>();
  const identities = new Set<string>();
  for (const entry of entries) {
    if (identities.has(entry.identity)) {
      throw new Error(`Duplicate native tool identity: ${entry.identity}`);
    }
    identities.add(entry.identity);
    bases.set(entry.base, (bases.get(entry.base) ?? 0) + 1);
  }
  const toolsByName = new Map<string, ToolDefinition>();
  const functions: Record<string, ChatModelFunctions[string]> =
    Object.create(null);
  for (const { tool, identity, base } of entries) {
    let name = base;
    if (bases.get(base) !== 1) {
      name = `${base}_${nameHash(identity)}`;
      let suffix = 2;
      while (bases.has(name) || toolsByName.has(name))
        name = `${base}_${nameHash(identity)}_${suffix++}`;
    }
    const schema = inputSchema(tool);
    functions[name] = {
      description: tool.description,
      params: schema as GbnfJsonSchema,
    };
    toolsByName.set(name, tool);
  }
  return { functions, toolsByName };
}
