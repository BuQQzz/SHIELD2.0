/**
 * Utilities for detecting message truncation in AI responses
 */

/**
 * Detect if a response was truncated (cut off mid-sentence or at token limit)
 * @param content - The AI response content
 * @param maxTokens - Maximum tokens allowed
 * @returns true if the response was likely truncated
 */
export function detectTruncation(
  content: string,
  maxTokens: number
): boolean {
  // Token estimation: ~3-4 chars per token on average
  const estimatedTokens = Math.ceil(content.length / 3.5);
  const tokenLimitReached = estimatedTokens >= maxTokens * 0.9;

  // Also check if response ends abruptly (no ending punctuation)
  const endsWithPunctuation = /[.!?][\s]*$/.test(content.trim());
  const endsWithCodeBlock = /```[\s]*$/.test(content.trim());
  const wasTruncated =
    tokenLimitReached && (!endsWithPunctuation || endsWithCodeBlock);

  return wasTruncated;
}
