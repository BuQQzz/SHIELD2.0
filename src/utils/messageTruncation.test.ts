import { describe, it, expect } from "vitest";
import { detectTruncation } from "./messageTruncation";

describe("messageTruncation", () => {
  describe("detectTruncation", () => {
    it("should detect truncation when token limit reached and no ending punctuation", () => {
      const content = "This is a very long message that was cut off in the middle of a sentence";
      const maxTokens = 20; // Content is ~21 tokens
      
      const result = detectTruncation(content, maxTokens);
      
      // No ending punctuation + token limit reached = truncated
      expect(result).toBe(true);
    });

    it("should not detect truncation when message ends with period", () => {
      const content = "This is a complete sentence.";
      const maxTokens = 100;
      
      const result = detectTruncation(content, maxTokens);
      
      expect(result).toBe(false);
    });

    it("should not detect truncation when message ends with exclamation mark", () => {
      const content = "This is exciting!";
      const maxTokens = 100;
      
      const result = detectTruncation(content, maxTokens);
      
      expect(result).toBe(false);
    });

    it("should not detect truncation when message ends with question mark", () => {
      const content = "Is this a question?";
      const maxTokens = 100;
      
      const result = detectTruncation(content, maxTokens);
      
      expect(result).toBe(false);
    });

    it("should detect truncation when ending with code block", () => {
      const content = "Here is some code:\n```javascript\nconst x = 1;\n```";
      const maxTokens = 15; // Content approaches token limit
      
      const result = detectTruncation(content, maxTokens);
      
      // Code block ending + token limit = likely truncated
      expect(result).toBe(true);
    });

    it("should not detect truncation when well under token limit", () => {
      const content = "Short message";
      const maxTokens = 1000;
      
      const result = detectTruncation(content, maxTokens);
      
      expect(result).toBe(false);
    });

    it("should use 90% threshold for token limit", () => {
      // If maxTokens is 100, threshold is 90 tokens
      // At ~3.5 chars per token, 90 tokens = ~315 chars
      const content = "a".repeat(315); // ~90 tokens
      const maxTokens = 100;
      
      const result = detectTruncation(content, maxTokens);
      
      // At 90% threshold without ending punctuation = truncated
      expect(result).toBe(true);
    });

    it("should handle messages with punctuation and whitespace", () => {
      const content = "This is a complete message.   ";
      const maxTokens = 100;
      
      const result = detectTruncation(content, maxTokens);
      
      // Trailing whitespace should be trimmed, ending punctuation detected
      expect(result).toBe(false);
    });
  });
});
