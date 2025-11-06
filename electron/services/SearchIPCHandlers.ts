import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import { getWebSearchService } from "./WebSearchService.js";
import { getWebCacheService } from "./WebCacheService.js";

const webSearchService = getWebSearchService();
let webCacheService: ReturnType<typeof getWebCacheService> | null = null;

/**
 * Register all web search related IPC handlers
 */
export function registerSearchHandlers(mainWindow: BrowserWindow | null) {
  // Web Search handlers
  ipcMain.handle("web-search:initialize", async (_event, settings) => {
    try {
      // Try to initialize cache with user settings (optional - graceful failure)
      try {
        webCacheService = getWebCacheService(
          settings?.maxCacheSizeMB,
          settings?.cacheExpiryHours
        );
        await webCacheService.initialize();
        console.log("[WebSearch] Cache initialized successfully");
      } catch (cacheError) {
        console.warn(
          "[WebSearch] Cache initialization failed (will proceed without cache):",
          cacheError instanceof Error ? cacheError.message : "Unknown error"
        );
        webCacheService = null; // Disable cache
      }

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

  ipcMain.handle("web-search:fetch", async (_event, url, options) => {
    try {
      // Check cache first
      if (webCacheService) {
        const cached = await webCacheService.get(url);
        if (cached) {
          console.log("[WebSearch] Returning cached content for:", url);
          return { success: true, content: cached, fromCache: true };
        }
      }

      // Fetch fresh content
      const content = await webSearchService.fetchPage(url, options);

      // Store in cache
      if (webCacheService) {
        await webCacheService.set(url, content);
      }

      return { success: true, content, fromCache: false };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

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
}

/**
 * Get the web search and cache service instances for cleanup
 */
export function getSearchServiceInstances() {
  return { webSearchService, webCacheService };
}
