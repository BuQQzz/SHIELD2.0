import { describe, it, expect } from "vitest";
import { extractThinking, thinkingPatterns } from "./thinkingParser";

describe("thinkingParser", () => {
  describe("thinkingPatterns", () => {
    it("should have all 6 thinking patterns", () => {
      expect(thinkingPatterns).toHaveLength(6);
    });

    it("should have proper pattern structure", () => {
      thinkingPatterns.forEach((pattern) => {
        expect(pattern).toHaveProperty("name");
        expect(pattern).toHaveProperty("pattern");
        expect(pattern).toHaveProperty("thinkingIndex");
        expect(pattern).toHaveProperty("contentIndex");
        expect(pattern.pattern).toBeInstanceOf(RegExp);
      });
    });
  });

  describe("extractThinking", () => {
    it("should extract analysis tag content", () => {
      const content = "<analysis>My thinking process</analysis>Final answer";
      const result = extractThinking(content);
      
      expect(result.thinking).toBe("My thinking process");
      expect(result.processedContent).toBe("Final answer");
    });

    it("should extract thinking tag content", () => {
      const content = "<thinking>Deep thoughts</thinking>My response";
      const result = extractThinking(content);
      
      expect(result.thinking).toBe("Deep thoughts");
      expect(result.processedContent).toBe("My response");
    });

    it("should extract thought tag content", () => {
      const content = "<thought>Quick thought</thought>Answer here";
      const result = extractThinking(content);
      
      expect(result.thinking).toBe("Quick thought");
      expect(result.processedContent).toBe("Answer here");
    });

    it("should extract chain_of_thought tag content", () => {
      const content = "<chain_of_thought>Step by step</chain_of_thought>Result";
      const result = extractThinking(content);
      
      expect(result.thinking).toBe("Step by step");
      expect(result.processedContent).toBe("Result");
    });

    it("should extract GPT OSS format with analysis and final tags", () => {
      const content = "<start><analysis>Internal reasoning</analysis><final>User-facing answer</final><end>";
      const result = extractThinking(content);
      
      expect(result.thinking).toBe("Internal reasoning");
      expect(result.processedContent).toBe("User-facing answer");
    });

    it("should extract GPT OSS pipe format", () => {
      const content = "<|start|>assistant<|channel|>analysis<|message|>Internal thinking<|end|><|start|>assistant<|channel|>final<|message|>Final answer";
      const result = extractThinking(content);
      
      expect(result.thinking).toBe("Internal thinking");
      expect(result.processedContent).toBe("Final answer");
    });

    it("should return undefined thinking when no patterns match", () => {
      const content = "Just a regular response without any thinking tags";
      const result = extractThinking(content);
      
      expect(result.thinking).toBeUndefined();
      expect(result.processedContent).toBe(content);
    });

    it("should handle multiline thinking content", () => {
      const content = `<thinking>
Step 1: Analyze the problem
Step 2: Consider options
Step 3: Make a decision
</thinking>
Here is my final answer`;
      const result = extractThinking(content);
      
      expect(result.thinking).toContain("Step 1");
      expect(result.thinking).toContain("Step 2");
      expect(result.thinking).toContain("Step 3");
      expect(result.processedContent).toBe("Here is my final answer");
    });

    it("should clean XML wrapper tags from processed content", () => {
      const content = "<start><analysis>Thinking</analysis>Some <final>content</final> here<end>";
      const result = extractThinking(content);
      
      // Should extract thinking and clean up the wrapper tags
      expect(result.thinking).toBe("Thinking");
      expect(result.processedContent).not.toContain("<start>");
      expect(result.processedContent).not.toContain("</end>");
    });
  });
});
