/**
 * Connectors: MCP servers the user adds on the Plugins page
 *
 * The built-in filesystem server and SHIELD's own tools (web, terminal,
 * memory, plan) live elsewhere. A connector is either one of the catalog's
 * online services (one click: Connect, sign in in the browser) or one the
 * user adds by hand - a server address, or a command that starts a server on
 * this PC.
 *
 * Its tools reach the model as `<id>__<tool>`: two connectors may both have
 * a "search" tool, and native tool names may not contain the "." the
 * text-call format uses for a server name.
 */

/** How a connector proves who the user is */
export type ConnectorAuth =
  /** OAuth in the browser; the server registers SHIELD itself (RFC 7591) */
  | "oauth"
  /** A token the user pastes, sent as `Authorization: Bearer` */
  | "token"
  | "none";

export interface CatalogEntry {
  /** Becomes the connector's id and its tools' prefix */
  id: string;
  name: string;
  description: string;
  url: string;
  auth: ConnectorAuth;
  /** For token auth: where to make one, and what it needs */
  tokenHelp?: { url: string; text: string };
}

/**
 * Online services SHIELD offers with one click.
 *
 * Each URL was checked on 2026-11-12: it answers an MCP request (401 until
 * signed in where it has auth), and for "oauth" its authorization server
 * offers dynamic client registration - without that, a client needs an app
 * registered with the service in advance. GitHub has none, so it takes a
 * token. Stripe and Supabase did not advertise registration where the MCP
 * spec says to look, so they are left out until they can be tested.
 */
export const CONNECTOR_CATALOG: readonly CatalogEntry[] = [
  {
    id: "github",
    name: "GitHub",
    description: "Repositories, issues and pull requests",
    url: "https://api.githubcopilot.com/mcp/",
    auth: "token",
    tokenHelp: {
      url: "https://github.com/settings/personal-access-tokens/new",
      text: "Create a fine-grained token with access to the repositories you want SHIELD to see.",
    },
  },
  {
    id: "notion",
    name: "Notion",
    description: "Search, read and update pages and databases",
    url: "https://mcp.notion.com/mcp",
    auth: "oauth",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Issues, projects and comments",
    url: "https://mcp.linear.app/mcp",
    auth: "oauth",
  },
  {
    id: "atlassian",
    name: "Jira & Confluence",
    description: "Atlassian issues and pages",
    url: "https://mcp.atlassian.com/v1/mcp",
    auth: "oauth",
  },
  {
    id: "asana",
    name: "Asana",
    description: "Tasks and projects",
    url: "https://mcp.asana.com/v2/mcp",
    auth: "oauth",
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Errors and issues from your apps",
    url: "https://mcp.sentry.dev/mcp",
    auth: "oauth",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Actions in the apps you connected on Zapier",
    url: "https://mcp.zapier.com/api/mcp/mcp",
    auth: "oauth",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "Search models, datasets and papers",
    url: "https://huggingface.co/mcp",
    auth: "oauth",
  },
  {
    id: "context7",
    name: "Context7",
    description: "Up-to-date documentation for code libraries",
    url: "https://mcp.context7.com/mcp",
    auth: "none",
  },
];

/** A connector the user added, as the Plugins page and the store see it */
export type ConnectorConfig = {
  id: string;
  name: string;
  /** Off: not started, and its tools are not offered */
  enabled: boolean;
  /** Tools the user switched off: never offered to the model */
  disabledTools: string[];
  /** The catalog entry it came from; manual connectors have none */
  catalogId?: string;
} & (
  | { kind: "remote"; url: string; auth: ConnectorAuth }
  | {
      kind: "local";
      command: string;
      args: string[];
      /** Names only: values may be secrets and stay in the main process */
      envNames: string[];
    }
);

export type ConnectorState =
  | "off"
  | "connecting"
  /** Waiting for the user to finish signing in in the browser */
  | "signing-in"
  | "connected"
  /** Needs a sign-in or a token before it can connect */
  | "needs-auth"
  | "error";

/** What the renderer is told about a connector */
export type ConnectorSummary = ConnectorConfig & {
  state: ConnectorState;
  error?: string;
  /** Whether a token or sign-in is saved (never the secret itself) */
  hasCredentials: boolean;
  tools: Array<{ name: string; description: string; readOnly: boolean }>;
  /** Rough prompt cost of its enabled tools, in tokens */
  toolTokens: number;
};

/** What the Plugins page sends to add a connector by hand */
export type ManualConnectorInput =
  | {
      kind: "remote";
      name: string;
      url: string;
      /** Optional token, sent as `Authorization: Bearer` */
      token?: string;
    }
  | {
      kind: "local";
      name: string;
      command: string;
      args: string[];
      env: Record<string, string>;
    };

/** Server names of connector tools carry this prefix (`ext:notion`) */
const SERVER_PREFIX = "ext:";
const SEPARATOR = "__";

export function connectorServerName(id: string): string {
  return SERVER_PREFIX + id;
}

/** The connector id of a server name, or null for any other server */
export function connectorIdOfServer(
  serverName: string | undefined
): string | null {
  return serverName?.startsWith(SERVER_PREFIX)
    ? serverName.slice(SERVER_PREFIX.length)
    : null;
}

/** OpenAI-style tool names: letters, digits, _ and -, at most 64 */
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** The name the model sees for a connector's tool */
export function connectorToolName(id: string, tool: string): string {
  return `${id}${SEPARATOR}${tool}`;
}

/** Whether a connector tool's name can be offered as a native tool */
export function isValidToolName(name: string): boolean {
  return TOOL_NAME.test(name);
}

/**
 * The connector and tool a model-facing name stands for, or null when the
 * name has no connector prefix. Whether such a connector exists is the
 * caller's check.
 */
export function splitConnectorTool(
  name: string
): { id: string; tool: string } | null {
  const at = name.indexOf(SEPARATOR);
  if (at <= 0 || at + SEPARATOR.length >= name.length) return null;
  const id = name.slice(0, at);
  if (!isConnectorId(id)) return null;
  return { id, tool: name.slice(at + SEPARATOR.length) };
}

/** Connector ids: lower-case slugs, so a tool name stays valid */
export function isConnectorId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,23}$/.test(id) && !id.includes("--");
}

/** A free connector id for a name, given the ids already taken */
export function connectorIdFor(name: string, taken: Iterable<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 20) || "server";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`;
    if (!used.has(id)) return id;
  }
}

/** Rough tokens a tool costs in the prompt: its JSON, about 4 characters each */
export function toolTokens(tool: {
  name: string;
  description?: string;
  inputSchema?: unknown;
}): number {
  const size =
    tool.name.length +
    (tool.description?.length ?? 0) +
    JSON.stringify(tool.inputSchema ?? {}).length;
  return Math.ceil(size / 4) + 10;
}

/** Splits a command line on spaces, keeping "quoted parts" together */
export function splitArgs(text: string): string[] {
  const parts = text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return parts.map((p) => p.replace(/^(["'])(.*)\1$/, "$2"));
}
