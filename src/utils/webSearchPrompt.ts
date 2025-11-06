/**
 * Utilities for building web search context prompts
 */

/**
 * Build a context-enriched message for web search responses
 * Includes detailed instructions for the AI to follow a structured reasoning process
 * @param content - The user's original query
 * @param webSearchContext - The search results context
 * @returns The enriched message with instructions
 */
export function buildWebSearchPrompt(
  content: string,
  webSearchContext: string
): string {
  let messageWithContext = `${webSearchContext}`;
  messageWithContext += `\n⚠️⚠️⚠️ REMINDER: Today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} ⚠️⚠️⚠️\n\n`;
  messageWithContext += `===== USER'S QUESTION =====\n${content}\n`;
  messageWithContext += `===== END USER'S QUESTION =====\n\n`;

  // Chain-of-Thought + Attribution approach for grounding
  messageWithContext += `⚠️ CRITICAL: You MUST follow this 3-step reasoning process ⚠️\n\n`;

  messageWithContext += `IMPORTANT: Wrap your reasoning in <reasoning> tags, and your final answer outside.\n`;
  messageWithContext += `Format:\n<reasoning>\nSTEP 1: [your analysis]\nSTEP 2: [your analysis]\nSTEP 3: [your conclusion]\n</reasoning>\n[Your final answer to the user]\n\n`;

  messageWithContext += `STEP 1 - EXTRACT KEY FACTS:\n`;
  messageWithContext += `List the specific facts from the search results that relate to the question.\n`;
  messageWithContext += `Quote the exact text: [Quote: "exact words from search result"]\n\n`;

  messageWithContext += `STEP 2 - ANALYZE:\n`;
  messageWithContext += `Explain what those facts mean. Pay attention to:\n`;
  messageWithContext += `- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n`;
  messageWithContext += `- CRITICAL DATE LOGIC:\n`;
  messageWithContext += `  * If scheduled date is in the FUTURE (after today) = NOT released yet\n`;
  messageWithContext += `  * If scheduled date is in the PAST (before today) = ALREADY released\n`;
  messageWithContext += `  * If results explicitly say "not yet released" = NOT released (even if date passed)\n`;
  messageWithContext += `- Example: If something was scheduled for October 29, 2025 and today is November 4, 2025, it ALREADY HAPPENED\n\n`;

  messageWithContext += `STEP 3 - ANSWER:\n`;
  messageWithContext += `Based ONLY on the facts you extracted, answer the user's question.\n`;
  messageWithContext += `If the search results don't contain the answer, say "The search results don't provide this information."\n\n`;

  messageWithContext += `Example Format:\n`;
  messageWithContext += `<reasoning>\n`;
  messageWithContext += `STEP 1: [Quote: "The Outer Worlds 2 will launch... this coming October 2025"] [Quote: "scheduled for release in late October 2025"]\n`;
  messageWithContext += `STEP 2: The game was scheduled for October 2025. Today is November 4, 2025, which is AFTER October 2025. This means the scheduled date has passed, so the game ALREADY released.\n`;
  messageWithContext += `STEP 3: Yes, The Outer Worlds 2 has been released (it came out in October 2025).\n`;
  messageWithContext += `</reasoning>\n`;
  messageWithContext += `Yes, The Outer Worlds 2 has already been released! It came out on October 29, 2025 for PS5, Xbox Series X|S, and PC.\n\n`;

  messageWithContext += `Now follow these steps for the user's question:\n`;

  return messageWithContext;
}
