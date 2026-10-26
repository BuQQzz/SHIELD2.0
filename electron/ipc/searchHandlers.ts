import { ipcMain } from "electron";
import {
  getWebSearchService,
  type PageContent,
  type PrivacyOptions,
} from "../services/WebSearchService.js";
import { getWebCacheService } from "../services/WebCacheService.js";

let webCacheService: ReturnType<typeof getWebCacheService> | null = null;

/**
 * Start the page cache if it is not running. The chat's globe toggle used to
 * do this before each search; the model's fetch_page tool now does it on
 * first use. A cache that fails to start is skipped, not fatal.
 */
export async function ensurePageCache(settings?: {
  maxCacheSizeMB?: number;
  cacheExpiryHours?: number;
}): Promise<void> {
  if (webCacheService) return;
  try {
    const cache = getWebCacheService(
      settings?.maxCacheSizeMB,
      settings?.cacheExpiryHours
    );
    await cache.initialize();
    webCacheService = cache;
    console.log("[WebSearch] Cache initialized successfully");
  } catch (cacheError) {
    console.warn(
      "[WebSearch] Cache initialization failed (will proceed without cache):",
      cacheError instanceof Error ? cacheError.message : "Unknown error"
    );
  }
}

/** A page's clean text, from the cache when it has it */
export async function fetchPageCached(
  url: string,
  options: PrivacyOptions = {}
): Promise<{ content: PageContent; fromCache: boolean }> {
  if (webCacheService) {
    const cached = await webCacheService.get(url);
    if (cached) {
      console.log("[WebSearch] Returning cached content for:", url);
      return { content: cached, fromCache: true };
    }
  }
  const content = await getWebSearchService().fetchPage(url, options);
  if (webCacheService) await webCacheService.set(url, content);
  return { content, fromCache: false };
}

/**
 * Register all web search related IPC handlers
 */
export function registerSearchHandlers() {
  const webSearchService = getWebSearchService();

  // Initialize web search
  ipcMain.handle("web-search:initialize", async (_event, settings) => {
    try {
      // Optional - search works without the cache
      await ensurePageCache(settings);

      // Initialize search service (required)
      await webSearchService.initialize();
      return { success: true, cacheEnabled: webCacheService !== null };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Perform search query
  ipcMain.handle(
    "web-search:query",
    async (_event, query, maxResults, options) => {
      try {
        const results = await webSearchService.search(
          query,
          maxResults,
          options
        );
        return { success: true, results };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  );

  // Fetch web page content
  ipcMain.handle("web-search:fetch", async (_event, url, options) => {
    try {
      const { content, fromCache } = await fetchPageCached(url, options);
      return { success: true, content, fromCache };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get cached content
  ipcMain.handle("web-search:cache-get", async (_event, url) => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const content = await webCacheService.get(url);
      return { success: true, content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Check if URL is cached
  ipcMain.handle("web-search:cache-has", async (_event, url) => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const has = await webCacheService.has(url);
      return { success: true, has };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Get cache statistics
  ipcMain.handle("web-search:cache-stats", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const stats = await webCacheService.getStats();
      return { success: true, stats };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Clear cache
  ipcMain.handle("web-search:cache-clear", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      await webCacheService.clear();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Clear expired cache entries
  ipcMain.handle("web-search:cache-clear-expired", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const deletedCount = await webCacheService.clearExpired();
      return { success: true, deletedCount };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Export cache entries
  ipcMain.handle("web-search:cache-export", async () => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      const entries = await webCacheService.export();
      return { success: true, entries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Delete cached URL
  ipcMain.handle("web-search:cache-delete", async (_event, url) => {
    try {
      if (!webCacheService) {
        return { success: false, error: "Cache not initialized" };
      }

      await webCacheService.delete(url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  return { webSearchService, getWebCacheService: () => webCacheService };
}
