import { describe, it, expect } from "vitest";
import {
  estimateTokenCount,
  endsWithPunctuation,
  endsWithCodeBlock,
  isTruncated,
} from "./messageTruncation";

describe("messageTruncation", () => {
  describe("estimateTokenCount", () => {
    it("should estimate tokens based on character count", () => {
      const shortText = "Hello"; // 5 chars
      expect(estimateTokenCount(shortText)).toBe(Math.ceil(5 / 3.5));
    });

    it("should handle empty string", () => {
      expect(estimateTokenCount("")).toBe(0);
    });

    it("should estimate ~286 tokens for 1000 characters", () => {
      const text = "a".repeat(1000);
      expect(estimateTokenCount(text)).toBe(286); // ceil(1000/3.5)
    });

    it("should round up to nearest integer", () => {
      const text = "ab"; // 2 chars, 2/3.5 = 0.57...
      expect(estimateTokenCount(text)).toBe(1);
    });
  });

  describe("endsWithPunctuation", () => {
    it("should return true for sentences ending with period", () => {
      expect(endsWithPunctuation("This is a sentence.")).toBe(true);
    });

    it("should return true for sentences ending with question mark", () => {
      expect(endsWithPunctuation("Is this a question?")).toBe(true);
    });

    it("should return true for sentences ending with exclamation", () => {
      expect(endsWithPunctuation("This is exciting!")).toBe(true);
    });

    it("should return true with trailing whitespace", () => {
      expect(endsWithPunctuation("Sentence.  ")).toBe(true);
      expect(endsWithPunctuation("Question?   \n")).toBe(true);
    });

    it("should return false for incomplete sentences", () => {
      expect(endsWithPunctuation("This is incomplete")).toBe(false);
    });

    it("should return false for sentences ending mid-word", () => {
      expect(endsWithPunctuation("This is incomple")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(endsWithPunctuation("")).toBe(false);
    });
  });

  describe("endsWithCodeBlock", () => {
    it("should return true for incomplete code block", () => {
      expect(endsWithCodeBlock("Here is some code:\n```")).toBe(true);
    });

    it("should return true with trailing whitespace", () => {
      expect(endsWithCodeBlock("Code block:\n```  ")).toBe(true);
    });

    it("should return false for complete code block", () => {
      expect(endsWithCodeBlock("```javascript\ncode\n```")).toBe(false);
    });

    it("should return false for text without code block", () => {
      expect(endsWithCodeBlock("Regular text")).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(endsWithCodeBlock("")).toBe(false);
    });
  });

  describe("isTruncated", () => {
    const maxTokens = 100;

    it("should return false for short content with proper ending", () => {
      const content = "This is a short response.";
      expect(isTruncated(content, { maxTokens })).toBe(false);
    });

    it("should return false for long content with proper ending", () => {
      // Create content that's close to limit but ends properly
      const content = "a".repeat(300) + "."; // ~86 tokens with period
      expect(isTruncated(content, { maxTokens })).toBe(false);
    });

    it("should return true when at token limit without punctuation", () => {
      // Create content at 90% of token limit (315 chars = ~90 tokens)
      const content = "a".repeat(315);
      expect(isTruncated(content, { maxTokens })).toBe(true);
    });

    it("should return true when at token limit with code block", () => {
      // Content at limit ending with code block marker
      const content = "a".repeat(310) + "```";
      expect(isTruncated(content, { maxTokens })).toBe(true);
    });

    it("should return false when below 90% of token limit", () => {
      // Create content below threshold
      const content = "a".repeat(280); // ~80 tokens (below 90% of 100)
      expect(isTruncated(content, { maxTokens })).toBe(false);
    });

    it("should use 90% threshold for token limit", () => {
      // Content at exactly 90% should not trigger if it ends properly
      const content = "a".repeat(315) + "."; // ~90 tokens with proper ending
      expect(isTruncated(content, { maxTokens })).toBe(false);

      // But without proper ending it should trigger
      const contentNoEnd = "a".repeat(315);
      expect(isTruncated(contentNoEnd, { maxTokens })).toBe(true);
    });

    it("should handle empty content", () => {
      expect(isTruncated("", { maxTokens })).toBe(false);
    });

    it("should detect truncation with question mark at limit", () => {
      // Even with punctuation, code block marker indicates truncation
      const content = "a".repeat(310) + "?```";
      expect(isTruncated(content, { maxTokens })).toBe(true);
    });
  });
});
