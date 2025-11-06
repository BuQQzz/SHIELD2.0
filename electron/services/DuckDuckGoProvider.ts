import { Browser, Page } from "playwright-core";
import * as cheerio from "cheerio";

/**
 * DuckDuckGo search provider with privacy-focused features
 * Implements stealth mode, tracker blocking, and result parsing
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface PrivacyOptions {
  userAgent?: string;
  timeout?: number;
  blockTrackers?: boolean;
  useRandomUA?: boolean;
}

/**
 * List of common tracking and analytics domains to block
 */
const TRACKER_DOMAINS = [
  "google-analytics.com",
  "googletagmanager.com",
  "facebook.com/tr",
  "facebook.net",
  "doubleclick.net",
  "googlesyndication.com",
  "analytics.google.com",
  "adservice.google.com",
  "mixpanel.com",
  "segment.io",
  "hotjar.com",
  "clarity.ms",
  "fullstory.com",
  "mouseflow.com",
  "inspectlet.com",
  "quantserve.com",
  "scorecardresearch.com",
  "pixel",
  "analytics",
  "track",
  "beacon",
];

/**
 * Privacy-focused user agents for request anonymization
 */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

export class DuckDuckGoProvider {
  /**
   * Create a privacy-focused browser page with tracker blocking
   */
  async createPrivacyPage(
    browser: Browser,
    options: PrivacyOptions
  ): Promise<Page> {
    const page = await browser.newPage({
      userAgent: options.useRandomUA
        ? this.getRandomUserAgent()
        : options.userAgent || USER_AGENTS[0],
    });

    // Stealth: Override navigator properties to hide automation
    await page.addInitScript(() => {
      // Override webdriver property
      Object.defineProperty(navigator, "webdriver", {
        get: () => false,
      });

      // Override plugins to look like a real browser
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Chrome runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).chrome = {
        runtime: {},
      };

      // Permissions API
      const originalQuery = window.navigator.permissions.query;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator.permissions as any).query = (parameters: any) =>
        parameters.name === "notifications"
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Promise.resolve({ state: Notification.permission as any })
          : originalQuery(parameters);
    });

    // Block trackers and analytics
    if (options.blockTrackers !== false) {
      await page.route("**/*", (route) => {
        const url = route.request().url().toLowerCase();
        const resourceType = route.request().resourceType();

        // Block known tracker domains
        const isTracker = TRACKER_DOMAINS.some((domain) =>
          url.includes(domain)
        );

        // Block analytics scripts and pixels
        const isAnalytics = resourceType === "image" && url.includes("pixel");

        if (isTracker || isAnalytics) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    // Set additional privacy headers
    await page.setExtraHTTPHeaders({
      DNT: "1", // Do Not Track
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Upgrade-Insecure-Requests": "1",
    });

    return page;
  }

  /**
   * Search DuckDuckGo and return results
   */
  async search(
    browser: Browser,
    query: string,
    maxResults: number,
    options: PrivacyOptions
  ): Promise<SearchResult[]> {
    const sanitizedQuery = this.sanitizeQuery(query);
    console.log(`[WebSearch] Searching DuckDuckGo: "${sanitizedQuery}"`);

    const page = await this.createPrivacyPage(browser, options);

    try {
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

      return this.parseSearchResults(html, maxResults);
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Parse DuckDuckGo HTML search results
   */
  private parseSearchResults(html: string, maxResults: number): SearchResult[] {
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    // Debug: Check what elements exist
    console.log("[WebSearch] Looking for .result elements");
    console.log("[WebSearch] Found .result count:", $(".result").length);
    console.log("[WebSearch] Found .result__a count:", $(".result__a").length);

    $(".result").each((index, element) => {
      if (index >= maxResults) return false;

      const $result = $(element);
      const $link = $result.find(".result__a");
      const $snippet = $result.find(".result__snippet");

      const title = $link.text().trim();
      const url = $link.attr("href");
      const snippet = $snippet.text().trim();

      console.log(
        `[WebSearch] Result ${index}: title="${title?.substring(0, 50)}", url="${url?.substring(0, 50)}"`
      );

      if (title && url) {
        results.push({
          title,
          url: this.cleanDuckDuckGoUrl(url),
          snippet,
          position: index + 1,
        });
      }
    });

    console.log(`[WebSearch] Found ${results.length} results`);
    return results;
  }

  /**
   * Clean DuckDuckGo redirect URLs
   */
  private cleanDuckDuckGoUrl(url: string): string {
    try {
      // Fix protocol-relative URLs
      let cleanUrl = url;
      if (cleanUrl.startsWith("//")) {
        cleanUrl = "https:" + cleanUrl;
      }

      // DuckDuckGo sometimes wraps URLs in redirects
      const urlObj = new URL(cleanUrl);
      const uddg = urlObj.searchParams.get("uddg");
      return uddg ? decodeURIComponent(uddg) : cleanUrl;
    } catch {
      // If URL parsing fails, try fixing protocol
      if (url.startsWith("//")) {
        return "https:" + url;
      }
      return url;
    }
  }

  /**
   * Sanitize search query
   */
  private sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/[<>]/g, "") // Remove HTML tags
      .substring(0, 500); // Limit length
  }

  /**
   * Get random user agent for privacy
   */
  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }
}
