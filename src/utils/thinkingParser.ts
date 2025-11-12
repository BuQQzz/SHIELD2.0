/**
 * Parses various XML-based thinking/reasoning patterns from LLM responses
 * Supports formats from GPT OSS, Qwen Coder, and other chain-of-thought models
 */

interface ThinkingPattern {
  name: string;
  pattern: RegExp;
  thinkingIndex: number;
  contentIndex: number | null;
}

export interface ParsedThinking {
  thinking?: string;
  reasoning?: string;
  processedContent: string;
}

/**
 * Patterns for extracting thinking/analysis content from various LLM formats
 */
const THINKING_PATTERNS: ThinkingPattern[] = [
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

/**
 * Parse reasoning tags (used for web search responses)
 */
export function parseReasoning(
  content: string,
  showReasoning: boolean
): { reasoning?: string; processedContent: string } {
  const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);

  if (!reasoningMatch || !reasoningMatch[1]) {
    return { processedContent: content };
  }

  const reasoning = reasoningMatch[1].trim();

  // If showReasoning is false, remove the reasoning tags and content
  if (!showReasoning) {
    const processedContent = content
      .replace(/<reasoning>[\s\S]*?<\/reasoning>\s*/, "")
      .trim();
    return { reasoning, processedContent };
  }

  // If showing reasoning, make it look nice
  const processedContent = content.replace(
    /<reasoning>([\s\S]*?)<\/reasoning>/,
    "**🧠 AI Reasoning:**\n$1\n---\n"
  );

  return { reasoning, processedContent };
}

/**
 * Parse thinking/analysis patterns from chain-of-thought models
 */
export function parseThinking(content: string): {
  thinking?: string;
  processedContent: string;
} {
  for (const { pattern, thinkingIndex, contentIndex } of THINKING_PATTERNS) {
    const match = content.match(pattern);

    if (!match || !match[thinkingIndex]) {
      continue;
    }

    const thinking = match[thinkingIndex].trim();

    // If pattern has separate content index (like GPT OSS format)
    if (contentIndex !== null && match[contentIndex]) {
      return {
        thinking,
        processedContent: match[contentIndex].trim(),
      };
    }

    // Remove the entire matched pattern from response
    let processedContent = content.replace(pattern, "").trim();

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

    return { thinking, processedContent };
  }

  // No thinking pattern found
  return { processedContent: content };
}

/**
 * Parse all thinking/reasoning patterns from LLM response
 * Combines both reasoning (web search) and thinking (chain-of-thought) patterns
 */
export function parseAllThinking(
  content: string,
  hasWebSearchContext: boolean,
  showReasoning: boolean
): ParsedThinking {
  const result: ParsedThinking = { processedContent: content };

  // Parse reasoning tags for web search responses
  if (hasWebSearchContext) {
    const { reasoning, processedContent } = parseReasoning(
      content,
      showReasoning
    );
    result.reasoning = reasoning;
    result.processedContent = processedContent;
  }

  // Parse thinking patterns for chain-of-thought models
  const { thinking, processedContent } = parseThinking(result.processedContent);
  result.thinking = thinking;
  result.processedContent = processedContent;

  return result;
}
