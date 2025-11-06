import { chromium, Browser } from "playwright-core";
import {
  DuckDuckGoProvider,
  SearchResult,
  PrivacyOptions,
} from "./DuckDuckGoProvider";
import {
  ContentExtractor,
  PageContent,
} from "./SearchContentExtractor";

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
  private searchProvider: DuckDuckGoProvider;
  private contentExtractor: ContentExtractor;

  constructor() {
    this.searchProvider = new DuckDuckGoProvider();
    this.contentExtractor = new ContentExtractor();
  }

  /**
   * Initialize the browser instance for web scraping
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
      this.isInitialized = true;
      console.log("[WebSearch] Browser initialized");
    } catch (error) {
      console.error("[WebSearch] Failed to initialize browser:", error);
      throw new Error("Failed to initialize web search browser");
    }
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

    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    try {
      return await this.searchProvider.search(
        this.browser,
        query,
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

    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const cleanUrl = this.contentExtractor.removeTrackingParams(url);
    console.log(`[WebSearch] Fetching page: ${cleanUrl}`);

    try {
      const page = await this.searchProvider.createPrivacyPage(
        this.browser,
        options
      );

      // Navigate to the page
      await page.goto(cleanUrl, {
        waitUntil: "domcontentloaded",
        timeout: options.timeout || 5000, // Reduced from 20s to 5s
      });

      // Get page HTML
      const html = await page.content();
      const pageTitle = await page.title();

      await page.close();

      // Extract clean content using ContentExtractor
      return this.contentExtractor.formatPageContent(html, pageTitle, cleanUrl);
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
