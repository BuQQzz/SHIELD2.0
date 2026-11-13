import { describe, expect, it } from "vitest";
import {
  CONNECTOR_CATALOG,
  connectorIdFor,
  connectorIdOfServer,
  connectorServerName,
  connectorToolName,
  isConnectorId,
  isValidToolName,
  splitArgs,
  splitConnectorTool,
} from "./connectors";
import { extractToolCalls } from "@/handlers/toolCallParsing";
import { stepLabel } from "@/components/chat/turns";
import { resolveToolPolicy } from "@/hooks/useToolPolicy";
import type { ToolDefinition } from "@/types/prompts";

describe("connector tool names", () => {
  it("prefix the tool with the connector, and split back", () => {
    const name = connectorToolName("notion", "search");
    expect(name).toBe("notion__search");
    expect(isValidToolName(name)).toBe(true);
    expect(splitConnectorTool(name)).toEqual({ id: "notion", tool: "search" });
  });

  it("keep a tool's own underscores", () => {
    expect(splitConnectorTool("github__create_pull_request")).toEqual({
      id: "github",
      tool: "create_pull_request",
    });
  });

  it("are not found in SHIELD's own tool names", () => {
    for (const name of [
      "read_text_file",
      "run_command",
      "web_search",
      "update_plan",
      "__x",
      "x__",
    ]) {
      expect(splitConnectorTool(name)).toBeNull();
    }
  });

  it("server names carry the ext: prefix", () => {
    expect(connectorServerName("linear")).toBe("ext:linear");
    expect(connectorIdOfServer("ext:linear")).toBe("linear");
    expect(connectorIdOfServer("filesystem")).toBeNull();
    expect(connectorIdOfServer(undefined)).toBeNull();
  });
});

describe("connector ids", () => {
  it("are slugs of the name, and never taken twice", () => {
    expect(connectorIdFor("My Git Server!", [])).toBe("my-git-server");
    expect(connectorIdFor("Notion", ["notion"])).toBe("notion-2");
    expect(connectorIdFor("Notion", ["notion", "notion-2"])).toBe("notion-3");
    expect(connectorIdFor("???", [])).toBe("server");
  });

  it("never hold the tool-name separator", () => {
    expect(connectorIdFor("a__b", [])).toBe("a-b");
    expect(isConnectorId("a-b")).toBe(true);
    expect(isConnectorId("a_b")).toBe(false);
    expect(isConnectorId("A")).toBe(false);
  });
});

describe("the catalog", () => {
  it("has unique, valid ids and https addresses", () => {
    const ids = CONNECTOR_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of CONNECTOR_CATALOG) {
      expect(isConnectorId(entry.id)).toBe(true);
      expect(new URL(entry.url).protocol).toBe("https:");
      if (entry.auth === "token") expect(entry.tokenHelp).toBeDefined();
    }
  });
});

describe("splitArgs", () => {
  it("splits on spaces and keeps quoted parts whole", () => {
    expect(splitArgs('npx -y @scope/server "/home/me/My Notes"')).toEqual([
      "npx",
      "-y",
      "@scope/server",
      "/home/me/My Notes",
    ]);
    expect(splitArgs("  ")).toEqual([]);
  });
});

describe("a model's call to a connector tool", () => {
  it("is filed under the connector's server, with its full name", () => {
    const [call] = extractToolCalls(
      '{"tool_calls":[{"function":{"name":"notion__search","arguments":{"query":"plans"}}}]}'
    );
    expect(call).toMatchObject({
      serverName: "ext:notion",
      tool: "notion__search",
      arguments: { query: "plans" },
    });
  });
});

describe("the tool policy and connectors", () => {
  const connectorTool = (name: string, readOnly: boolean): ToolDefinition => ({
    name,
    description: name,
    serverName: "ext:notion",
    parameters: [],
    ...(readOnly ? { annotations: { readOnlyHint: true } } : {}),
  });
  const tools = [
    connectorTool("notion__search", true),
    connectorTool("notion__update_page", false),
  ];

  it("offers them in chats too, without the file-tool allowlist", () => {
    const policy = resolveToolPolicy({
      mode: "ask",
      allowedTools: [],
      serverTools: tools,
      fileTools: false,
    });
    expect(policy.advertisedTools.map((t) => t.name)).toEqual([
      "notion__search",
      "notion__update_page",
    ]);
  });

  it("not to a team's orchestrator", () => {
    const policy = resolveToolPolicy({
      mode: "auto",
      allowedTools: [],
      serverTools: tools,
      teamMode: true,
    });
    expect(policy.advertisedTools).toEqual([]);
  });

  it("read-only mode hides the tools that can change things", () => {
    const policy = resolveToolPolicy({
      mode: "readonly",
      allowedTools: [],
      serverTools: tools,
    });
    expect(policy.advertisedTools.map((t) => t.name)).toEqual([
      "notion__search",
    ]);
  });
});

describe("a connector call in the chat's activity line", () => {
  it("names the connector and the tool, not the internal server name", () => {
    expect(
      stepLabel(
        "context7__resolve-library-id",
        "ext:context7",
        undefined,
        "done"
      )
    ).toBe("context7 · resolve-library-id");
  });
});
