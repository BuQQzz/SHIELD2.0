/**
 * Web tools for the model (main process only)
 *
 * web_search and fetch_page, offered as the "web" server next to the
 * filesystem tools. They replace the chat box's globe toggle, which searched
 * before a message whether or not the answer needed it: now the model
 * decides when it needs the web, like any other tool. Both only read. The
 * user switches them on and off in Settings > Web Search.
 */

import type { MCPToolResult } from "./MCPServerConfig.js";
import type { PageContent, SearchResult } from "./WebSearchService.js";
import { checkPublicUrlResolved } from "./web-search/urlSafety.js";

export const WEB_SERVER_NAME = "web";
export const WEB_SEARCH_TOOL_NAME = "web_search";
export const FETCH_PAGE_TOOL_NAME = "fetch_page";

/** Page text per fetch_page call: ~2.5k tokens, fits an 8k window's budget */
export const PAGE_CHUNK_CHARS = 8000;

/** Read-only, and the result comes from outside this PC */
const WEB_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const WEB_TOOLS = [
  {
    name: WEB_SEARCH_TOOL_NAME,
    description:
      "Search the web (DuckDuckGo) for current or specific information: news, recent releases and versions, documentation, facts you are not sure of. Returns titles, URLs and short snippets; read a result in full with fetch_page. The query is sent to DuckDuckGo, so never put private details from the user's files in it.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What to search for, in a few words",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: WEB_ANNOTATIONS,
  },
  {
    name: FETCH_PAGE_TOOL_NAME,
    description: `Read a public web page as plain text - usually a URL from web_search results. Returns up to ${PAGE_CHUNK_CHARS.toLocaleString("en-US")} characters; for a longer page, call again with "start" to read on.`,
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full http or https address of the page",
        },
        start: {
          type: "number",
          description:
            "Character to start from, for reading on in a long page (default 0)",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    annotations: WEB_ANNOTATIONS,
  },
];

export function isWebTool(name: string): boolean {
  return name === WEB_SEARCH_TOOL_NAME || name === FETCH_PAGE_TOOL_NAME;
}

export interface WebToolDeps {
  enabled: boolean;
  maxResults: number;
  search: (query: string, maxResults: number) => Promise<SearchResult[]>;
  fetchPage: (url: string) => Promise<PageContent>;
  /** Every address a host name resolves to */
  lookup: (hostname: string) => Promise<string[]>;
}

const text = (message: string): MCPToolResult => ({
  success: true,
  data: { content: [{ type: "text", text: message }] },
});

const fail = (error: string): MCPToolResult => ({ success: false, error });

/** Numbered results the model can cite and pass to fetch_page */
export function formatSearchResults(
  query: string,
  results: SearchResult[]
): string {
  if (results.length === 0) {
    return `No results for "${query}". Try different or fewer words.`;
  }
  const lines = results.map((result, i) =>
    [
      `${i + 1}. ${result.title.trim()}`,
      `   ${result.url}`,
      result.snippet.trim() ? `   ${result.snippet.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
  return `Results for "${query}":\n\n${lines.join("\n\n")}\n\nTo read one in full, call fetch_page with its URL.`;
}

/** One chunk of a page's text, saying where it is and how to read on */
export function formatPageChunk(page: PageContent, start = 0): string {
  const body = page.textContent.replace(/\n{3,}/g, "\n\n").trim();
  const from = Math.min(Math.max(0, Math.floor(start)), body.length);
  const to = Math.min(body.length, from + PAGE_CHUNK_CHARS);
  const header = [`Title: ${page.title || "(none)"}`, `URL: ${page.url}`].join(
    "\n"
  );

  if (body.length === 0) {
    return `${header}\n\nThe page has no readable text (it may need JavaScript or a login).`;
  }
  if (from >= body.length) {
    return `${header}\n\nThe page ends at character ${body.length.toLocaleString("en-US")}; there is nothing after start ${from.toLocaleString("en-US")}.`;
  }

  const range =
    from === 0 && to === body.length
      ? ""
      : `\n[Characters ${(from + 1).toLocaleString("en-US")}-${to.toLocaleString("en-US")} of ${body.length.toLocaleString("en-US")}.${
          to < body.length
            ? ` To read on, call fetch_page with this URL and "start": ${to}.`
            : ""
        }]`;
  return `${header}${range}\n\n${body.slice(from, to)}`;
}

/** Run a web tool. Never throws: failures come back as tool errors. */
export async function runWebTool(
  tool: string,
  args: Record<string, unknown>,
  deps: WebToolDeps
): Promise<MCPToolResult> {
  if (!deps.enabled) {
    return fail(
      "Web search is turned off in Settings > Web Search, so this did not run. Tell the user."
    );
  }

  try {
    if (tool === WEB_SEARCH_TOOL_NAME) {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) return fail('web_search needs a "query"');
      const results = await deps.search(query, deps.maxResults);
      return text(formatSearchResults(query, results));
    }

    if (tool === FETCH_PAGE_TOOL_NAME) {
      const check = await checkPublicUrlResolved(args.url, deps.lookup);
      if (!check.ok) return fail(check.reason);
      const start = typeof args.start === "number" ? args.start : 0;
      const page = await deps.fetchPage(check.url.href);
      return text(formatPageChunk(page, start));
    }

    return fail(`There is no web tool called '${tool}'`);
  } catch (error) {
    return fail(describeFailure(tool, error));
  }
}

/**
 * What the model is told when a web tool fails, with the next step. Told
 * only "Failed to initialize web search browser", Qwen3-Coder listed the
 * workspace and wrote check_node_version.js into it to find the latest
 * Node.js release (2026-09-24).
 */
export function describeFailure(tool: string, error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error))
    .trim()
    .replace(/\.?$/, ".");
  const giveUp =
    "Tell the user, then answer from what you already know and say it may be out of date. Do not try to work around this with other tools.";
  // Offline (InAppBrowser's wording): nothing the model can retry
  if (/not connected to the internet/i.test(message)) {
    return `Web search is unavailable: ${message} ${giveUp}`;
  }
  if (tool === WEB_SEARCH_TOOL_NAME) {
    return `The search did not work: ${message} Try once more with different words. If it fails again, web search is not working right now: ${giveUp}`;
  }
  return `Could not read this page: ${message} Try another result, or answer from the search snippets.`;
}
