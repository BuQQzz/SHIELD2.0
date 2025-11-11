/**
 * Search result processing and URL utilities
 * Handles query sanitization and URL cleaning
 */

export class SearchResultProcessor {
  /**
   * Sanitize search query
   */
  sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/[<>]/g, "") // Remove HTML tags
      .substring(0, 500); // Limit length
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
