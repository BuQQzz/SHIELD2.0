import { loadPage } from "./web-search/InAppBrowser";
import {
  ContentExtractor,
  type PageContent,
} from "./web-search/ContentExtractor";
import { SearchProvider, type SearchResult } from "./web-search/SearchProvider";

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

    try {
      const { html } = await loadPage(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(sanitizedQuery)}`,
        options.timeout ?? 15000
      );
      return this.searchProvider.parseSearchResults(html, maxResults);
    } catch (error) {
      console.error("[WebSearch] Search failed:", error);
      throw new Error(
        `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
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
