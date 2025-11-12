import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface PageContent {
  url: string;
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline?: string;
  length: number;
  fetchedAt: Date;
  metadata: {
    domain: string;
    contentType?: string;
    language?: string;
  };
}

/**
 * Extracts and processes web page content
 */
export class ContentExtractor {
  /**
   * Extract clean readable content from HTML using Readability
   */
  extractContent(html: string, url: string, pageTitle: string): PageContent {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      throw new Error("Failed to extract readable content from page");
    }

    const cleanUrl = this.removeTrackingParams(url);

    return {
      url: cleanUrl,
      title: article.title || pageTitle,
      content: article.content || "",
      textContent: article.textContent || "",
      excerpt: article.excerpt || "",
      byline: article.byline || undefined,
      length: article.length || 0,
      fetchedAt: new Date(),
      metadata: {
        domain: new URL(cleanUrl).hostname,
        contentType: "text/html",
        language: article.lang || undefined,
      },
    };
  }

  /**
   * Remove tracking parameters from URLs
   */
  removeTrackingParams(url: string): string {
    try {
      const urlObj = new URL(url);
      const trackingParams = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "fbclid",
        "gclid",
        "msclkid",
        "mc_eid",
        "mc_cid",
        "_ga",
        "ref",
      ];

      trackingParams.forEach((param) => {
        urlObj.searchParams.delete(param);
      });

      return urlObj.toString();
    } catch {
      return url;
    }
  }
}
