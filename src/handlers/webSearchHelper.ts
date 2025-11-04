import type { SearchResult, PageContent } from "../types/electron";

export interface WebSearchResult {
  context: string;
  sources: SearchResult[];
}

/**
 * Check if a query is a vague follow-up that shouldn't trigger web search
 */
export function isVagueFollowUpQuery(content: string): boolean {
  const vagueFollowUpPatterns = [
    // Only match explicit re-check requests (must include "again", "once more", etc.)
    /^(please|can you|could you)?\s*(check|look|verify|confirm)\s+(again|once more|one more time)/i,
    // Vague references without specifics
    /^(what|how)\s*about\s*(that|this|it)\s*\??\s*$/i,
    // Starting with conjunctions only (no substance)
    /^(and|but|so|also)\s*\??\s*$/i,
    // Simple yes/no responses only
    /^(yes|no|ok|okay|sure|nope|yep|yeah|nah)\s*\??\s*$/i,
  ];

  return vagueFollowUpPatterns.some((pattern: RegExp) =>
    pattern.test(content.trim())
  );
}

/**
 * Build web search context from full page content
 */
function buildFullContentContext(
  contents: PageContent[],
  results: SearchResult[]
): string {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let context = "\n\n--- Web Search Results ---\n";
  context += `Current Date: ${currentDate}\n`;
  context += `Note: Full content available from ${contents.length} pages, snippets from ${results.length - contents.length} additional results.\n\n`;

  // Add full content first
  context += "=== FULL PAGE CONTENT ===\n";
  contents.forEach((pageContent, index) => {
    context += `\nSource ${index + 1}: ${pageContent.title}\n`;
    context += `Content: ${pageContent.textContent.slice(0, 1500)}...\n`;
  });

  // Add snippets from results we didn't fetch
  if (results.length > contents.length) {
    context += "\n=== ADDITIONAL SNIPPETS (Limited Info) ===\n";
    results.slice(contents.length).forEach((result, index) => {
      context += `\n${index + contents.length + 1}. ${result.title}\n`;
      context += `   Snippet: ${result.snippet}\n`;
    });
  }

  context += "\n--- End of Search Results ---\n\n";
  context += addCriticalInstructions(
    currentDate,
    "CURRENT LIVE WEB SEARCH RESULTS",
    true
  );

  return context;
}

/**
 * Build web search context from snippets only
 */
function buildSnippetsContext(results: SearchResult[]): string {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let context = "\n\n--- Web Search Results ---\n";
  context += `Current Date: ${currentDate}\n\n`;
  results.forEach((result, index) => {
    context += `\n${index + 1}. ${result.title}\n`;
    context += `   ${result.snippet}\n`;
  });
  context += "\n--- End of Search Results ---\n\n";
  context += addCriticalInstructions(
    currentDate,
    "CURRENT LIVE WEB SEARCH SNIPPETS",
    false
  );

  return context;
}

/**
 * Add critical instructions for using web search results
 */
function addCriticalInstructions(
  currentDate: string,
  sourceType: string,
  isFullContent: boolean
): string {
  let instructions = "⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️\n\n";
  instructions += `You are answering based on ${sourceType} shown above. These ${isFullContent ? "results" : "snippets"} were just fetched from the internet.\n\n`;
  instructions += "ABSOLUTE RULES:\n";
  instructions += `1. ONLY use information ${isFullContent ? "that appears in the search results" : "from the snippets"} above\n`;
  instructions += `2. ${isFullContent ? "If search results say something different from your training data, YOU MUST USE THE SEARCH RESULTS" : "Search results OVERRIDE your training data - use them instead"}\n`;
  instructions += `3. DO NOT ${isFullContent ? "make up or assume" : "invent"} any information not in the ${isFullContent ? "results" : "snippets"}\n`;
  instructions += "4. DO NOT list sources - they will be shown separately\n";
  instructions += `5. ${isFullContent ? "If information is unclear or contradictory in results, SAY SO" : 'If snippets are unclear or limited, say "Based on the search results..."'}\n`;
  instructions += `6. Today's date is: ${currentDate}\n\n`;
  instructions += `${isFullContent ? "Your response MUST be based on the search results above, NOT your training data." : "Answer using ONLY the snippets above."}\n\n`;

  return instructions;
}

/**
 * Perform web search and build context for LLM
 */
export async function performWebSearchAndBuildContext(
  query: string,
  performWebSearch: (query: string) => Promise<{
    results: SearchResult[];
    contents: PageContent[];
  } | null>,
  setIsSearching?: (value: boolean) => void
): Promise<WebSearchResult> {
  console.log("[WebSearchHelper] Performing web search for query:", query);

  // Set searching state to true
  if (setIsSearching) {
    setIsSearching(true);
  }

  try {
    const searchData = await performWebSearch(query);

    console.log("[WebSearchHelper] Search data received:", {
      hasContents: searchData?.contents && searchData.contents.length > 0,
      contentsCount: searchData?.contents?.length || 0,
      resultsCount: searchData?.results?.length || 0,
      firstResult: searchData?.results?.[0]?.title || "none",
    });

    if (!searchData) {
      return { context: "", sources: [] };
    }

    let context = "";
    const sources = searchData.results || [];

    if (searchData.contents.length > 0) {
      console.log(
        `[WebSearchHelper] Building context from ${searchData.contents.length} full pages and ${searchData.results.length} search results`
      );
      context = buildFullContentContext(
        searchData.contents,
        searchData.results
      );
      console.log("[WebSearchHelper] Full content context built");
    } else if (searchData.results.length > 0) {
      console.log(
        `[WebSearchHelper] Building context from ${searchData.results.length} search snippets`
      );
      context = buildSnippetsContext(searchData.results);
      console.log("[WebSearchHelper] Snippets context built");
    } else {
      console.warn("[WebSearchHelper] No search results found");
    }

    return { context, sources };
  } catch (error) {
    console.error("[WebSearchHelper] Web search failed:", error);
    return { context: "", sources: [] };
  } finally {
    // Set searching state to false
    if (setIsSearching) {
      setIsSearching(false);
    }
  }
}
