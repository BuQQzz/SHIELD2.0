import { describe, it, expect } from "vitest";
import { buildWebSearchPrompt } from "./webSearchPrompt";

describe("webSearchPrompt", () => {
  describe("buildWebSearchPrompt", () => {
    it("should include the original user query", () => {
      const content = "What is the weather today?";
      const context = "Search results about weather";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain(content);
    });

    it("should include the search context", () => {
      const content = "Test query";
      const context = "Important search results here";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain(context);
    });

    it("should include reasoning instructions", () => {
      const content = "Test query";
      const context = "Test context";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain("<reasoning>");
      expect(result).toContain("STEP 1");
      expect(result).toContain("STEP 2");
      expect(result).toContain("STEP 3");
    });

    it("should include today's date", () => {
      const content = "Test query";
      const context = "Test context";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toMatch(/Today is/);
      // Should contain a date
      expect(result).toMatch(/\d{4}/); // Year
    });

    it("should include critical date logic instructions", () => {
      const content = "Test query";
      const context = "Test context";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain("CRITICAL DATE LOGIC");
      expect(result).toContain("FUTURE");
      expect(result).toContain("PAST");
    });

    it("should include example format", () => {
      const content = "Test query";
      const context = "Test context";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain("Example Format");
      expect(result).toContain("Outer Worlds 2");
    });

    it("should wrap user question in markers", () => {
      const content = "My specific question?";
      const context = "Search results";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain("===== USER'S QUESTION =====");
      expect(result).toContain("===== END USER'S QUESTION =====");
    });

    it("should include quote extraction instructions", () => {
      const content = "Test query";
      const context = "Test context";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain("[Quote:");
      expect(result).toContain("exact words from search result");
    });

    it("should end with instruction to follow steps", () => {
      const content = "Test query";
      const context = "Test context";
      
      const result = buildWebSearchPrompt(content, context);
      
      expect(result).toContain("Now follow these steps");
    });
  });
});
