/**
 * Thinking Parser Utility
 * Extracts and parses thinking/analysis/reasoning content from AI responses
 * Supports multiple XML formats used by various models (GPT OSS, Qwen Coder, etc.)
 */

export interface ThinkingPattern {
  name: string;
  pattern: RegExp;
  thinkingIndex: number;
  contentIndex: number | null;
}

/**
 * Collection of XML patterns used by different models for chain-of-thought reasoning
 */
export const thinkingPatterns: ThinkingPattern[] = [
  {
    name: "GPT OSS pipe format (|channel|analysis + |channel|final)",
    // Matches: <|start|>assistant<|channel|>analysis<|message|>...<|end|><|start|>assistant<|channel|>final<|message|>...
    pattern:
      /<\|start\|>assistant<\|channel\|>analysis<\|message\|>([\s\S]*?)<\|end\|>[\s\S]*?<\|start\|>assistant<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|end\|>|$)/i,
    thinkingIndex: 1, // Extract analysis content
    contentIndex: 2, // Extract final content
  },
  {
    name: "GPT OSS format (start-analysis-final-end)",
    // Matches: <start><analysis>...</analysis>...<final>...</final>...<end>
    pattern:
      /<start>[\s\S]*?<analysis>([\s\S]*?)<\/analysis>[\s\S]*?<final>([\s\S]*?)<\/final>[\s\S]*?<\/end>/i,
    thinkingIndex: 1, // Extract analysis content
    contentIndex: 2, // Extract final content
  },
  {
    name: "analysis",
    pattern: /<analysis>([\s\S]*?)<\/analysis>/i,
    thinkingIndex: 1,
    contentIndex: null,
  },
  {
    name: "thinking",
    pattern: /<thinking>([\s\S]*?)<\/thinking>/i,
    thinkingIndex: 1,
    contentIndex: null,
  },
  {
    name: "thought",
    pattern: /<thought>([\s\S]*?)<\/thought>/i,
    thinkingIndex: 1,
    contentIndex: null,
  },
  {
    name: "chain_of_thought",
    pattern: /<chain_of_thought>([\s\S]*?)<\/chain_of_thought>/i,
    thinkingIndex: 1,
    contentIndex: null,
  },
];

export interface ThinkingExtractionResult {
  thinking: string | undefined;
  processedContent: string;
}

/**
 * Extracts thinking/analysis content from AI response using pattern matching
 * @param content - The full AI response content
 * @returns Object containing extracted thinking and processed content
 */
export function extractThinking(content: string): ThinkingExtractionResult {
  let processedContent = content;
  let thinking: string | undefined;

  for (const { pattern, thinkingIndex, contentIndex } of thinkingPatterns) {
    const match = content.match(pattern);

    if (match && match[thinkingIndex]) {
      thinking = match[thinkingIndex].trim();

      // If pattern has separate content index (like GPT OSS format)
      if (contentIndex !== null && match[contentIndex]) {
        processedContent = match[contentIndex].trim();
      } else {
        // Remove the entire matched pattern from response
        processedContent = content.replace(pattern, "").trim();

        // Also clean up any remaining XML wrapper tags
        processedContent = processedContent
          .replace(/<start>\s*/gi, "")
          .replace(/<\/end>\s*/gi, "")
          .replace(/<assistant>\s*/gi, "")
          .replace(/<channel>\s*/gi, "")
          .replace(/<message>\s*/gi, "")
          .replace(/<final>\s*/gi, "")
          .replace(/<\/message>\s*/gi, "")
          .replace(/<\/channel>\s*/gi, "")
          .replace(/<\/assistant>\s*/gi, "")
          .replace(/<\/final>\s*/gi, "")
          .trim();
      }

      break; // Found a match, stop searching
    }
  }

  return { thinking, processedContent };
}
