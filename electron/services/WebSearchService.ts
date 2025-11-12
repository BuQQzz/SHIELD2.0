import {
  BrowserManager,
  type PrivacyOptions,
} from "./web-search/BrowserManager";
import {
  ContentExtractor,
  type PageContent,
} from "./web-search/ContentExtractor";
import {
  SearchProvider,
  type SearchResult,
} from "./web-search/SearchProvider";

/**
 * Privacy-focused web search and content fetching service
 * Uses DuckDuckGo for privacy-focused search with no tracking
 * Implements request anonymization and tracker blocking
 */

export type { SearchResult, PageContent, PrivacyOptions };

export class WebSearchService {
  private browserManager: BrowserManager;
  private contentExtractor: ContentExtractor;
  private searchProvider: SearchProvider;

  constructor() {
    this.browserManager = new BrowserManager();
    this.contentExtractor = new ContentExtractor();
    this.searchProvider = new SearchProvider();
  }

  /**
   * Initialize the browser instance for web scraping
   */
  async initialize(): Promise<void> {
    await this.browserManager.initialize();
  }

  /**
   * Search DuckDuckGo with privacy focus (no API key required)
   */
  async search(
    query: string,
    maxResults: number = 5,
    options: PrivacyOptions = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    const sanitizedQuery = this.searchProvider.sanitizeQuery(query);

    console.log(`[WebSearch] Searching DuckDuckGo: "${sanitizedQuery}"`);

    try {
      const page = await this.browserManager.createPrivacyPage(options);

      // Navigate to DuckDuckGo HTML version (no JavaScript required)
      await page.goto(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(sanitizedQuery)}`,
        {
          waitUntil: "domcontentloaded",
          timeout: options.timeout || 15000,
        }
      );

      // Extract search results
      const html = await page.content();

      // Debug: Log HTML snippet to diagnose parsing issues
      console.log("[WebSearch] HTML snippet:", html.substring(0, 500));

      await page.close();

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
    await this.initialize();

    const cleanUrl = this.contentExtractor.removeTrackingParams(url);
    console.log(`[WebSearch] Fetching page: ${cleanUrl}`);

    try {
      const page = await this.browserManager.createPrivacyPage(options);

      // Navigate to the page
      await page.goto(cleanUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.timeout || 5000, // Reduced from 20s to 5s
      });

      // Get page HTML
      const html = await page.content();
      const pageTitle = await page.title();

      await page.close();

      // Extract clean content using Readability
      return this.contentExtractor.extractContent(html, cleanUrl, pageTitle);
    } catch (error) {
      console.error("[WebSearch] Page fetch failed:", error);
      throw new Error(
        `Failed to fetch page: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }



  /**
   * Cleanup browser instance
   */
  async dispose(): Promise<void> {
    await this.browserManager.dispose();
  }
}

// Singleton instance
let webSearchService: WebSearchService | null = null;

export function getWebSearchService(): WebSearchService {
  if (!webSearchService) {
    webSearchService = new WebSearchService();
  }
  return webSearchService;
}
