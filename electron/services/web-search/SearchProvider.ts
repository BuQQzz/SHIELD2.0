import * as cheerio from "cheerio";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

/**
 * Handles DuckDuckGo search operations
 */
export class SearchProvider {
  /**
   * Parse DuckDuckGo HTML search results
   */
  parseSearchResults(html: string, maxResults: number): SearchResult[] {
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
  sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/[<>]/g, "") // Remove HTML tags
      .substring(0, 500); // Limit length
  }
}
