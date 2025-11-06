/**
 * Utilities for parsing and extracting thinking/reasoning content from AI responses
 * Handles various XML formats used by different models (GPT OSS, Qwen Coder, etc.)
 */

export interface ThinkingPattern {
  name: string;
  pattern: RegExp;
  thinkingIndex: number;
  contentIndex: number | null;
}

/**
 * Various thinking/analysis XML formats used by different models
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
 * Extract thinking/analysis content from AI response using pattern matching
 * @param content - The raw AI response content
 * @returns Object with extracted thinking and processed content
 */
export function extractThinking(content: string): ThinkingExtractionResult {
  let thinking: string | undefined;
  let processedContent = content;

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
        processedContent = cleanXmlWrapperTags(processedContent);
      }

      break; // Found a match, stop searching
    }
  }

  return { thinking, processedContent };
}

/**
 * Clean up remaining XML wrapper tags from processed content
 * @param content - Content to clean
 * @returns Cleaned content
 */
function cleanXmlWrapperTags(content: string): string {
  return content
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
