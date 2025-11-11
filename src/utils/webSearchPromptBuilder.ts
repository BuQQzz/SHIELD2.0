/**
 * Web Search Prompt Builder Utility
 * Builds structured prompts for AI responses with web search context
 */

/**
 * Builds a comprehensive prompt with web search context
 * Includes chain-of-thought instructions and date-aware reasoning
 * @param userQuery - The user's original query
 * @param searchContext - The web search results context
 * @returns Formatted prompt with instructions
 */
export function buildWebSearchPrompt(
  userQuery: string,
  searchContext: string
): string {
  const today = new Date();
  const todayFormatted = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const todayLongFormatted = today.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let prompt = `${searchContext}`;
  prompt += `\n⚠️⚠️⚠️ REMINDER: Today is ${todayFormatted} ⚠️⚠️⚠️\n\n`;
  prompt += `===== USER'S QUESTION =====\n${userQuery}\n`;
  prompt += `===== END USER'S QUESTION =====\n\n`;

  // Chain-of-Thought + Attribution approach for grounding
  prompt += `⚠️ CRITICAL: You MUST follow this 3-step reasoning process ⚠️\n\n`;

  prompt += `IMPORTANT: Wrap your reasoning in <reasoning> tags, and your final answer outside.\n`;
  prompt += `Format:\n<reasoning>\nSTEP 1: [your analysis]\nSTEP 2: [your analysis]\nSTEP 3: [your conclusion]\n</reasoning>\n[Your final answer to the user]\n\n`;

  prompt += `STEP 1 - EXTRACT KEY FACTS:\n`;
  prompt += `List the specific facts from the search results that relate to the question.\n`;
  prompt += `Quote the exact text: [Quote: "exact words from search result"]\n\n`;

  prompt += `STEP 2 - ANALYZE:\n`;
  prompt += `Explain what those facts mean. Pay attention to:\n`;
  prompt += `- Today's date: ${todayLongFormatted}\n`;
  prompt += `- CRITICAL DATE LOGIC:\n`;
  prompt += `  * If scheduled date is in the FUTURE (after today) = NOT released yet\n`;
  prompt += `  * If scheduled date is in the PAST (before today) = ALREADY released\n`;
  prompt += `  * If results explicitly say "not yet released" = NOT released (even if date passed)\n`;
  prompt += `- Example: If something was scheduled for October 29, 2025 and today is November 4, 2025, it ALREADY HAPPENED\n\n`;

  prompt += `STEP 3 - ANSWER:\n`;
  prompt += `Based ONLY on the facts you extracted, answer the user's question.\n`;
  prompt += `If the search results don't contain the answer, say "The search results don't provide this information."\n\n`;

  prompt += `Example Format:\n`;
  prompt += `<reasoning>\n`;
  prompt += `STEP 1: [Quote: "The Outer Worlds 2 will launch... this coming October 2025"] [Quote: "scheduled for release in late October 2025"]\n`;
  prompt += `STEP 2: The game was scheduled for October 2025. Today is November 4, 2025, which is AFTER October 2025. This means the scheduled date has passed, so the game ALREADY released.\n`;
  prompt += `STEP 3: Yes, The Outer Worlds 2 has been released (it came out in October 2025).\n`;
  prompt += `</reasoning>\n`;
  prompt += `Yes, The Outer Worlds 2 has already been released! It came out on October 29, 2025 for PS5, Xbox Series X|S, and PC.\n\n`;

  prompt += `Now follow these steps for the user's question:\n`;

  return prompt;
}
