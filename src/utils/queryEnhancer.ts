import type { Message } from "../hooks/useLlama";

/**
 * Extract key entities and topics from conversation messages
 */
function extractKeyTopics(messages: Message[], maxTopics = 10): string[] {
  const topics = new Set<string>();

  // Look at last 4 messages for context
  const recentMessages = messages.slice(-4);

  for (const msg of recentMessages) {
    const content = msg.content.toLowerCase();

    // Extract potential entities (capitalized words, names, locations)
    const originalContent = msg.content;
    const capitalizedMatches = originalContent.match(
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g
    );
    if (capitalizedMatches) {
      capitalizedMatches.forEach((match) => {
        if (match.length > 2 && !isCommonWord(match)) {
          topics.add(match);
        }
      });
    }

    // Extract quoted terms
    const quotedMatches = content.match(/"([^"]+)"/g);
    if (quotedMatches) {
      quotedMatches.forEach((match) => {
        topics.add(match.replace(/"/g, ""));
      });
    }

    // Extract important keywords (nouns, specific terms)
    const importantKeywords = extractImportantKeywords(content);
    importantKeywords.forEach((keyword) => topics.add(keyword));
  }

  return Array.from(topics).slice(0, maxTopics);
}

/**
 * Check if a word is a common word that shouldn't be used as a topic
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    "The",
    "This",
    "That",
    "These",
    "Those",
    "What",
    "When",
    "Where",
    "Why",
    "How",
    "Who",
    "Which",
    "Here",
    "There",
    "They",
    "Their",
    "Some",
    "Many",
    "Each",
    "Every",
    "Could",
    "Would",
    "Should",
    "Must",
    "Might",
    "Will",
    "Can",
    "May",
    "Shall",
    "Have",
    "Has",
    "Had",
    "Been",
    "Being",
    "Done",
    "Made",
    "Give",
    "Take",
    "Come",
    "Go",
  ]);
  return commonWords.has(word);
}

/**
 * Extract important keywords from text
 */
function extractImportantKeywords(text: string): string[] {
  const keywords: string[] = [];

  // Match multi-word phrases that might be topics (2-4 words)
  const phrases = text.match(/\b[a-z]+(?:\s+[a-z]+){1,3}\b/g);
  if (phrases) {
    phrases.forEach((phrase) => {
      // Filter for phrases that look like topics (contain key topic words)
      if (
        phrase.match(
          /election|candidate|mayor|policy|position|race|vote|poll|campaign|debate/i
        )
      ) {
        keywords.push(phrase);
      }
    });
  }

  return keywords;
}

/**
 * Check if a query is vague and needs context enrichment
 */
function isVagueQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();

  // Vague reference patterns
  const vaguePatterns = [
    /^(what|how|why|when|where)\s+(about|are)\s+(they|them|their|his|her|it|that|this|these|those)/i,
    /\b(they|them|their|his|her|its?|that|this|these|those)\b.*\b(position|view|stance|policy|plan|idea)/i,
    /^(tell|show|explain|describe|list|compare)\s+(me\s+)?(about\s+)?(they|them|their|his|her|it|that|this)/i,
    /\b(more|additional)\s+(info|information|details|context)\b/i,
  ];

  return vaguePatterns.some((pattern) => pattern.test(lowerQuery));
}

/**
 * Enhance a vague query with conversation context
 */
export function enhanceQueryWithContext(
  query: string,
  messages: Message[]
): string {
  // If query is already specific (long and detailed), don't modify
  if (query.length > 100 || !isVagueQuery(query)) {
    return query;
  }

  // Extract topics from recent conversation
  const topics = extractKeyTopics(messages);

  if (topics.length === 0) {
    return query;
  }

  // Build enhanced query
  // Keep original query intent but add context
  const contextTerms = topics.slice(0, 5).join(" ");
  const enhancedQuery = `${contextTerms} ${query}`;

  return enhancedQuery;
}

/**
 * Determine if web search should be used based on query characteristics
 */
export function shouldUseWebSearch(
  query: string,
  messages: Message[]
): boolean {
  const lowerQuery = query.toLowerCase();

  // Clear indicators that web search should be used
  const searchIndicators = [
    /\b(latest|recent|current|today|now|update|news)\b/i,
    /\b(what('s| is)|when|where|who|how)\b.*\b(happening|going on|status)\b/i,
    /\b(search|look up|find|check)\b/i,
  ];

  // Check if query or recent messages suggest web search is needed
  const hasSearchIndicator = searchIndicators.some((pattern) =>
    pattern.test(lowerQuery)
  );

  // Check if recent conversation is about current events
  const recentMessages = messages.slice(-3);
  const hasCurrentEventContext = recentMessages.some((msg) =>
    /\b(latest|recent|current|today|news|update|election|2025)\b/i.test(
      msg.content
    )
  );

  return hasSearchIndicator || hasCurrentEventContext;
}
