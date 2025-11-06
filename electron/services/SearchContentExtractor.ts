import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

/**
 * Content extraction and processing utilities
 * Handles HTML to clean text conversion and metadata extraction
 */

export interface ExtractedContent {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline: string | null;
  length: number;
  lang: string | null;
}

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
 * ContentExtractor handles page content extraction and cleaning
 */
export class ContentExtractor {
  /**
   * Extract clean readable content from HTML using Readability
   */
  extractContent(html: string, url: string): ExtractedContent {
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

  /**
   * Format extracted content into PageContent structure
   */
  formatPageContent(
    html: string,
    pageTitle: string,
    url: string
  ): PageContent {
    const cleanUrl = this.removeTrackingParams(url);
    const content = this.extractContent(html, cleanUrl);

    return {
      url: cleanUrl,
      title: content.title || pageTitle,
      content: content.content || "",
      textContent: content.textContent || "",
      excerpt: content.excerpt || "",
      byline: content.byline || undefined,
      length: content.length || 0,
      fetchedAt: new Date(),
      metadata: {
        domain: new URL(cleanUrl).hostname,
        contentType: "text/html",
        language: content.lang || undefined,
      },
    };
  }
}
