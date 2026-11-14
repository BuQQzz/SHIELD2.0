import { loadPage } from "./web-search/InAppBrowser";
import {
  ContentExtractor,
  type PageContent,
} from "./web-search/ContentExtractor";
import { SearchProvider, type SearchResult } from "./web-search/SearchProvider";
import { ExaFallback } from "./web-search/ExaFallback";
import { isBlockedBrowserRequest } from "./web-search/urlSafety";

/**
 * Privacy-focused web search and content fetching service
 * Searches DuckDuckGo's HTML version (no JavaScript, no tracking) and reads
 * pages in SHIELD's in-app browser - see InAppBrowser.ts for what keeps it
 * anonymous.
 */

export type { SearchResult, PageContent };

/**
 * Kept for callers written for the Playwright browser. Only `timeout` has
 * an effect now: tracker blocking is always on, and one common user agent
 * is used because a rotating one makes a browser easier to single out.
 */
export interface PrivacyOptions {
  timeout?: number;
  blockTrackers?: boolean;
  useRandomUA?: boolean;
  userAgent?: string;
}

export class WebSearchService {
  private contentExtractor = new ContentExtractor();
  private searchProvider = new SearchProvider();
  /** When DuckDuckGo fails or finds nothing (ExaFallback.ts) */
  private exa = new ExaFallback();

  /** Nothing to start: the in-app browser opens a window per page */
  async initialize(): Promise<void> {}

  /**
   * Search DuckDuckGo with privacy focus (no API key required)
   */
  async search(
    query: string,
    maxResults: number = 5,
    options: PrivacyOptions = {}
  ): Promise<SearchResult[]> {
    const sanitizedQuery = this.searchProvider.sanitizeQuery(query);
    console.log(`[WebSearch] Searching DuckDuckGo: "${sanitizedQuery}"`);

    let first: unknown = null;
    try {
      const { html } = await loadPage(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(sanitizedQuery)}`,
        options.timeout ?? 15000
      );
      const results = this.searchProvider.parseSearchResults(html, maxResults);
      if (results.length > 0) return results;
      first = new Error("no results");
    } catch (error) {
      first = error;
    }
    // The backup engine, quietly: the model only needs results
    console.warn(
      `[WebSearch] DuckDuckGo: ${first instanceof Error ? first.message : String(first)}; asking Exa instead`
    );
    try {
      const results = await this.exa.search(sanitizedQuery, maxResults);
      console.log(`[WebSearch] Exa found ${results.length} results`);
      if (
        results.length > 0 ||
        !(first instanceof Error) ||
        first.message === "no results"
      ) {
        return results;
      }
    } catch (error) {
      console.error("[WebSearch] Exa search failed too:", error);
    }
    throw new Error(
      `Search failed: ${first instanceof Error ? first.message : "Unknown error"}`
    );
  }

  /**
   * Fetch and extract clean content from a web page
   */
  async fetchPage(
    url: string,
    options: PrivacyOptions = {}
  ): Promise<PageContent> {
    const cleanUrl = this.contentExtractor.removeTrackingParams(url);
    console.log(`[WebSearch] Fetching page: ${cleanUrl}`);

    try {
      const page = await loadPage(cleanUrl, options.timeout ?? 15000);
      // Extract clean content using Readability
      return this.contentExtractor.extractContent(
        page.html,
        page.url,
        page.title
      );
    } catch (error) {
      console.error("[WebSearch] Page fetch failed:", error);
      // A page the site would not serve SHIELD's browser: read through Exa.
      // Never an address SHIELD itself refuses (private or local networks)
      if (!isBlockedBrowserRequest(cleanUrl)) {
        const page = await this.exa.fetch(cleanUrl).catch((exaError) => {
          console.error("[WebSearch] Exa fetch failed too:", exaError);
          return null;
        });
        if (page) {
          console.log(`[WebSearch] Read ${cleanUrl} through Exa`);
          return {
            url: cleanUrl,
            title: page.title,
            content: page.text,
            textContent: page.text,
            excerpt: page.text.slice(0, 200),
            length: page.text.length,
            fetchedAt: new Date(),
            metadata: { domain: new URL(cleanUrl).hostname },
          };
        }
      }
      throw new Error(
        `Failed to fetch page: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /** Windows close after each page; nothing is left open */
  async dispose(): Promise<void> {}
}

// Singleton instance
let webSearchService: WebSearchService | null = null;

export function getWebSearchService(): WebSearchService {
  if (!webSearchService) {
    webSearchService = new WebSearchService();
  }
  return webSearchService;
}
