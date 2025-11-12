/**
 * Utilities for detecting message truncation
 */

export interface TruncationSettings {
  maxTokens: number;
}

/**
 * Detect if a message was truncated based on token limit and content analysis
 */
export function detectTruncation(
  content: string,
  settings: TruncationSettings
): boolean {
  // Token estimation: ~3-4 chars per token on average
  const estimatedTokens = Math.ceil(content.length / 3.5);
  const tokenLimitReached = estimatedTokens >= settings.maxTokens * 0.9;

  // Also check if response ends abruptly (no ending punctuation)
  const endsWithPunctuation = /[.!?][\s]*$/.test(content.trim());
  const endsWithCodeBlock = /```[\s]*$/.test(content.trim());
  const wasTruncated =
    tokenLimitReached && (!endsWithPunctuation || endsWithCodeBlock);

  return wasTruncated;
}
