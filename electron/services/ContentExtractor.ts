/**
 * Web content extraction service
 * Handles fetching and extracting clean content from web pages
 */

import { Browser } from "playwright-core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { PageContent, PrivacyOptions } from "./search-types";
import { DuckDuckGoProvider } from "./DuckDuckGoProvider";

export class ContentExtractor {
  private provider: DuckDuckGoProvider;

  constructor(private browser: Browser) {
    this.provider = new DuckDuckGoProvider(browser);
  }

  /**
   * Fetch and extract clean content from a web page
   */
  async fetchPage(url: string, options: PrivacyOptions): Promise<PageContent> {
    console.log(`[ContentExtractor] Fetching page: ${url}`);

    const page = await this.provider.createPrivacyPage(options);

    try {
      // Navigate to the page
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: options.timeout || 5000,
      });

      // Get page HTML
      const html = await page.content();
      const pageTitle = await page.title();

      // Extract clean content using Readability
      const content = this.extractContent(html, url);

      return {
        url,
        title: content.title || pageTitle,
        content: content.content || "",
        textContent: content.textContent || "",
        excerpt: content.excerpt || "",
        byline: content.byline || undefined,
        length: content.length || 0,
        fetchedAt: new Date(),
        metadata: {
          domain: new URL(url).hostname,
          contentType: "text/html",
          language: content.lang || undefined,
        },
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Extract clean readable content from HTML using Readability
   */
  private extractContent(html: string, url: string) {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      throw new Error("Failed to extract readable content from page");
    }

    return {
      title: article.title,
      content: article.content,
      textContent: article.textContent,
      excerpt: article.excerpt,
      byline: article.byline,
      length: article.length,
      lang: article.lang,
    };
  }
}
