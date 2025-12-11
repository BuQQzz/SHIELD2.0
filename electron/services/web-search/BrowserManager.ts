import { chromium, Browser, Page } from "playwright-core";

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

/**
 * Utility to yield to event loop - prevents UI freezing
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Manages browser instance and privacy-focused page creation
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private isInitialized = false;

  /**
   * Initialize the browser instance for web scraping
   * Uses event loop yielding to prevent UI freezing
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await yieldToEventLoop(); // Allow UI to update before heavy operation

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

      await yieldToEventLoop(); // Allow UI to update after browser launch
      this.isInitialized = true;
      console.log("[WebSearch] Browser initialized");
    } catch (error) {
      console.error("[WebSearch] Failed to initialize browser:", error);
      throw new Error("Failed to initialize web search browser");
    }
  }

  /**
   * Create a privacy-focused browser page with tracker blocking
   */
  async createPrivacyPage(options: PrivacyOptions): Promise<Page> {
    if (!this.browser) {
      throw new Error("Browser not initialized");
    }

    const page = await this.browser.newPage({
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
   * Get random user agent for privacy
   */
  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * Check if browser is initialized
   */
  getIsInitialized(): boolean {
    return this.isInitialized;
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
