import { describe, it, expect } from "vitest";
import { extractThinking, thinkingPatterns } from "./thinkingParser";

describe("thinkingParser", () => {
  describe("thinkingPatterns", () => {
    it("should export 6 thinking patterns", () => {
      expect(thinkingPatterns).toHaveLength(6);
    });

    it("should include all expected pattern types", () => {
      const patternNames = thinkingPatterns.map((p) => p.name);
      expect(patternNames).toContain(
        "GPT OSS pipe format (|channel|analysis + |channel|final)"
      );
      expect(patternNames).toContain(
        "GPT OSS format (start-analysis-final-end)"
      );
      expect(patternNames).toContain("analysis");
      expect(patternNames).toContain("thinking");
      expect(patternNames).toContain("thought");
      expect(patternNames).toContain("chain_of_thought");
    });
  });

  describe("extractThinking", () => {
    it("should return original content when no thinking tags present", () => {
      const content = "This is a regular response without thinking tags.";
      const result = extractThinking(content);

      expect(result.thinking).toBeUndefined();
      expect(result.processedContent).toBe(content);
    });

    it("should extract thinking from <thinking> tags", () => {
      const content =
        "<thinking>Internal analysis here</thinking>Final response";
      const result = extractThinking(content);

      expect(result.thinking).toBe("Internal analysis here");
      expect(result.processedContent).toBe("Final response");
    });

    it("should extract analysis from <analysis> tags", () => {
      const content =
        "<analysis>Detailed analysis</analysis>User-facing answer";
      const result = extractThinking(content);

      expect(result.thinking).toBe("Detailed analysis");
      expect(result.processedContent).toBe("User-facing answer");
    });

    it("should extract thought from <thought> tags", () => {
      const content = "<thought>A thought process</thought>Response text";
      const result = extractThinking(content);

      expect(result.thinking).toBe("A thought process");
      expect(result.processedContent).toBe("Response text");
    });

    it("should extract chain_of_thought from tags", () => {
      const content =
        "<chain_of_thought>Step by step</chain_of_thought>Final answer";
      const result = extractThinking(content);

      expect(result.thinking).toBe("Step by step");
      expect(result.processedContent).toBe("Final answer");
    });

    it("should handle GPT OSS pipe format", () => {
      const content =
        "<|start|>assistant<|channel|>analysis<|message|>Analysis content<|end|><|start|>assistant<|channel|>final<|message|>Final answer<|end|>";
      const result = extractThinking(content);

      expect(result.thinking).toBe("Analysis content");
      expect(result.processedContent).toBe("Final answer");
    });

    it("should handle GPT OSS start-analysis-final-end format", () => {
      const content =
        "<start><analysis>Internal thinking</analysis>Some text<final>User answer</final>More text</end>";
      const result = extractThinking(content);

      expect(result.thinking).toBe("Internal thinking");
      expect(result.processedContent).toBe("User answer");
    });

    it("should clean up XML wrapper tags", () => {
      const content = "<analysis>Think</analysis><start>Extra content</start>";
      const result = extractThinking(content);

      expect(result.processedContent).not.toContain("<start>");
      expect(result.processedContent).not.toContain("</start>");
    });

    it("should handle multiline thinking content", () => {
      const content = `<thinking>
First line of analysis
Second line of analysis
Third line of analysis
</thinking>
Final response to user`;
      const result = extractThinking(content);

      expect(result.thinking).toContain("First line of analysis");
      expect(result.thinking).toContain("Second line of analysis");
      expect(result.thinking).toContain("Third line of analysis");
      expect(result.processedContent).toBe("Final response to user");
    });

    it("should stop after finding first matching pattern", () => {
      const content =
        "<thinking>First pattern</thinking><analysis>Second pattern</analysis>Response";
      const result = extractThinking(content);

      // Should only extract from the first matching pattern (analysis comes before thinking in pattern array)
      expect(result.thinking).toBeDefined();
      expect(result.processedContent).toBe("Response");
    });
  });
});
