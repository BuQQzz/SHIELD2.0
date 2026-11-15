/**
 * The backup for web search: Exa's hosted MCP server, which answers without
 * an API key at a free rate limit (the same keyless service OpenCode uses).
 * Used only when DuckDuckGo fails or finds nothing, and for a page SHIELD
 * could not load itself. DuckDuckGo stays first: it sees less, and Exa's
 * keyless tier is meant for light use.
 *
 * DuckDuckGo had started answering repeat searches with a bot check, so
 * every search after the first waited 15 s and failed (2026-11-14). SHIELD
 * does not get past bot checks; it asks another engine instead.
 *
 * What Exa returns is web content like any other: it reaches the model as
 * an untrusted tool result.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { SearchResult } from "./SearchProvider.js";

export const EXA_MCP_URL = "https://mcp.exa.ai/mcp";
const TIMEOUT_MS = 20000;
/** Longest snippet per result, like a search engine's own */
const SNIPPET_CHARS = 300;
/** Most text read from one page */
const PAGE_CHARS = 12000;

/** One field's value in an Exa result block ("URL: https://...") */
function field(block: string, name: string): string {
  return (
    block.match(new RegExp(`^${name}:[ \\t]*(.*)$`, "m"))?.[1]?.trim() ?? ""
  );
}

/**
 * web_search_exa's text: result blocks, each starting "Title:", then URL,
 * Published, Author and Highlights or Text lines.
 */
export function parseExaSearch(
  text: string,
  maxResults: number
): SearchResult[] {
  const blocks = text
    .split(/^(?=Title:)/m)
    .filter((b) => b.startsWith("Title:"));
  const results: SearchResult[] = [];
  for (const block of blocks) {
    const title = field(block, "Title");
    const url = field(block, "URL");
    if (!title || !/^https?:\/\//i.test(url)) continue;
    const body = block
      .replace(/^(Title|URL|Published|Author|Image|Favicon|Score|ID):.*$/gm, "")
      .replace(/^(Highlights|Text|Summary):\s*/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    results.push({
      title,
      url,
      snippet:
        body.length > SNIPPET_CHARS
          ? `${body.slice(0, SNIPPET_CHARS - 1)}…`
          : body,
      position: results.length + 1,
    });
    if (results.length >= maxResults) break;
  }
  return results;
}

/** web_fetch_exa's text: "# Title", URL / Published / Author lines, the page */
export function parseExaFetch(
  text: string,
  url: string
): { title: string; text: string } | null {
  const title =
    text.match(/^#\s+(.+)$/m)?.[1]?.trim() || field(text, "Title") || url;
  const body = text
    .replace(/^#\s+.+$/m, "")
    .replace(/^(URL|Published|Author|Title):.*$/gm, "")
    .trim();
  if (body.length < 40) return null;
  return {
    title,
    text: body.length > PAGE_CHARS ? `${body.slice(0, PAGE_CHARS)}…` : body,
  };
}

function textOf(result: unknown): string {
  const content = (result as { content?: unknown[] }).content ?? [];
  return content
    .map((part) =>
      (part as { type?: string; text?: string }).type === "text"
        ? ((part as { text?: string }).text ?? "")
        : ""
    )
    .join("\n");
}

function withTimeout<T>(work: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`${what} took longer than ${TIMEOUT_MS / 1000} s`)),
        TIMEOUT_MS
      )
    ),
  ]);
}

export class ExaFallback {
  private client: Client | null = null;

  private async connect(): Promise<Client> {
    if (this.client) return this.client;
    const client = new Client({ name: "shield", version: "1.0.0" });
    await withTimeout(
      client.connect(new StreamableHTTPClientTransport(new URL(EXA_MCP_URL))),
      "Connecting to Exa"
    );
    this.client = client;
    return client;
  }

  /** One call, reconnecting once if the session went stale */
  private async call(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const client = await this.connect();
        const result = await withTimeout(
          client.callTool({ name, arguments: args }),
          "Exa"
        );
        if ((result as { isError?: boolean }).isError) {
          throw new Error(
            textOf(result).slice(0, 200) || "Exa returned an error"
          );
        }
        return textOf(result);
      } catch (error) {
        await this.client?.close().catch(() => {});
        this.client = null;
        if (attempt === 1) throw error;
      }
    }
    throw new Error("Exa is not available");
  }

  async search(query: string, maxResults: number): Promise<SearchResult[]> {
    const text = await this.call("web_search_exa", {
      query,
      numResults: Math.min(10, Math.max(1, maxResults)),
    });
    return parseExaSearch(text, maxResults);
  }

  async fetch(url: string): Promise<{ title: string; text: string } | null> {
    const text = await this.call("web_fetch_exa", {
      urls: [url],
      maxCharacters: PAGE_CHARS,
    });
    return parseExaFetch(text, url);
  }
}
