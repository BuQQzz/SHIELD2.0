/**
 * Message Truncation Detection Utility
 * Detects if AI response was truncated due to token limits
 */

export interface TruncationCheckOptions {
  maxTokens: number;
}

/**
 * Estimates the number of tokens in content
 * Uses ~3.5 characters per token as average for English text
 * @param content - Text content to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokenCount(content: string): number {
  return Math.ceil(content.length / 3.5);
}

/**
 * Checks if content ends with proper punctuation
 * @param content - Text content to check
 * @returns True if ends with sentence-ending punctuation
 */
export function endsWithPunctuation(content: string): boolean {
  return /[.!?][\s]*$/.test(content.trim());
}

/**
 * Checks if content ends with an incomplete code block
 * @param content - Text content to check
 * @returns True if ends with opening code block marker
 */
export function endsWithCodeBlock(content: string): boolean {
  return /```[\s]*$/.test(content.trim());
}

/**
 * Determines if a response was likely truncated
 * @param content - The AI response content
 * @param options - Options including max token limit
 * @returns True if response appears to be truncated
 */
export function isTruncated(
  content: string,
  options: TruncationCheckOptions
): boolean {
  const estimatedTokens = estimateTokenCount(content);
  const tokenLimitReached = estimatedTokens >= options.maxTokens * 0.9;

  // Response is truncated if it reached token limit AND
  // either doesn't end with punctuation OR ends with incomplete code block
  const hasProperEnding =
    endsWithPunctuation(content) && !endsWithCodeBlock(content);

  return tokenLimitReached && !hasProperEnding;
}
