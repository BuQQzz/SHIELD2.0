import { useState, useCallback } from "react";
import type { SearchResult, PageContent } from "@/types/electron";
import { useSettingsStore } from "@/store/settingsStore";

interface UseWebSearchReturn {
  searchResults: SearchResult[];
  isSearching: boolean;
  error: string | null;
  performSearch: (query: string) => Promise<{
    results: SearchResult[];
    contents: PageContent[];
  } | null>;
  clearResults: () => void;
}

export function useWebSearch(): UseWebSearchReturn {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettingsStore();

  const performSearch = useCallback(
    async (query: string) => {
      if (!settings.webSearch.enabled) {
        console.warn("[WebSearch] Web search is disabled in settings");
        return null;
      }

      setIsSearching(true);
      setError(null);
      setSearchResults([]);

      try {
        console.log("[WebSearch] Performing search for:", query);

        // Initialize web search service
        const initResult = await window.electronAPI.webSearch.initialize({
          maxCacheSizeMB: 50,
          cacheExpiryHours: settings.webSearch.cacheTTL / 60, // Convert minutes to hours
        });

        if (!initResult.success) {
          throw new Error(initResult.error || "Failed to initialize web search");
        }

        // Perform search query
        const searchResult = await window.electronAPI.webSearch.query(
          query,
          settings.webSearch.maxResults,
          {
            blockTrackers: true,
            useRandomUA: true,
            timeout: 10000,
          }
        );

        if (!searchResult.success || !searchResult.results) {
          throw new Error(searchResult.error || "Search failed");
        }

        console.log(
          `[WebSearch] Found ${searchResult.results.length} results`
        );
        setSearchResults(searchResult.results);

        // Fetch content from top results if caching is enabled
        const contents: PageContent[] = [];
        if (settings.webSearch.cacheEnabled) {
          const fetchPromises = searchResult.results
            .slice(0, 3) // Only fetch top 3 for performance
            .map(async (result) => {
              try {
                const contentResult =
                  await window.electronAPI.webSearch.fetch(result.url, {
                    blockTrackers: true,
                    useRandomUA: true,
                    timeout: 10000,
                  });

                if (contentResult.success && contentResult.content) {
                  console.log(
                    `[WebSearch] Fetched content from: ${result.url} (cached: ${contentResult.fromCache})`
                  );
                  return contentResult.content;
                }
              } catch (err) {
                console.warn(`[WebSearch] Failed to fetch ${result.url}:`, err);
              }
              return null;
            });

          const fetchedContents = await Promise.all(fetchPromises);
          contents.push(
            ...fetchedContents.filter((c): c is PageContent => c !== null)
          );
          console.log(`[WebSearch] Fetched ${contents.length} page contents`);
        }

        return {
          results: searchResult.results,
          contents,
        };
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error("[WebSearch] Search failed:", errorMessage);
        setError(errorMessage);
        return null;
      } finally {
        setIsSearching(false);
      }
    },
    [settings.webSearch]
  );

  const clearResults = useCallback(() => {
    setSearchResults([]);
    setError(null);
  }, []);

  return {
    searchResults,
    isSearching,
    error,
    performSearch,
    clearResults,
  };
}
