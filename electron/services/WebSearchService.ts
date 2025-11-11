import { chromium, Browser } from "playwright-core";
import { DuckDuckGoProvider } from "./DuckDuckGoProvider";
import { ContentExtractor } from "./ContentExtractor";
import { SearchResultProcessor } from "./SearchResultProcessor";
import { SearchResult, PageContent, PrivacyOptions } from "./search-types";

/**
 * Privacy-focused web search and content fetching service
 * Uses DuckDuckGo for privacy-focused search with no tracking
 * Implements request anonymization and tracker blocking
 */

// Re-export types for backward compatibility
export type { SearchResult, PageContent, PrivacyOptions };

export class WebSearchService {
  private browser: Browser | null = null;
  private isInitialized = false;
  private searchProvider: DuckDuckGoProvider | null = null;
  private contentExtractor: ContentExtractor | null = null;
  private resultProcessor: SearchResultProcessor;

  constructor() {
    this.resultProcessor = new SearchResultProcessor();
  }

  /**
   * Initialize the browser instance and providers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ],
      });

      this.searchProvider = new DuckDuckGoProvider(this.browser);
      this.contentExtractor = new ContentExtractor(this.browser);
      this.isInitialized = true;

      console.log("[WebSearch] Browser initialized");
    } catch (error) {
      console.error("[WebSearch] Failed to initialize browser:", error);
      throw new Error("Failed to initialize web search browser");
    }
  }

  /**
   * Search using configured provider (DuckDuckGo by default)
   */
  async search(
    query: string,
    maxResults: number = 5,
    options: PrivacyOptions = {}
  ): Promise<SearchResult[]> {
    await this.initialize();

    if (!this.searchProvider) {
      throw new Error("Search provider not initialized");
    }

    const sanitizedQuery = this.resultProcessor.sanitizeQuery(query);
    console.log(`[WebSearch] Searching: "${sanitizedQuery}"`);

    try {
      return await this.searchProvider.search(
        sanitizedQuery,
        maxResults,
        options
      );
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

    if (!this.contentExtractor) {
      throw new Error("Content extractor not initialized");
    }

    const cleanUrl = this.resultProcessor.removeTrackingParams(url);
    console.log(`[WebSearch] Fetching page: ${cleanUrl}`);

    try {
      return await this.contentExtractor.fetchPage(cleanUrl, options);
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
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.isInitialized = false;
      console.log("[WebSearch] Browser closed");
    }
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
