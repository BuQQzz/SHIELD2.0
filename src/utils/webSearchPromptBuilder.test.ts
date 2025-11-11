import { describe, it, expect } from "vitest";
import { buildWebSearchPrompt } from "./webSearchPromptBuilder";

describe("webSearchPromptBuilder", () => {
  describe("buildWebSearchPrompt", () => {
    const userQuery = "What is the weather today?";
    const searchContext = "Weather data from API: Sunny, 72°F";

    it("should include the search context", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain(searchContext);
    });

    it("should include the user query", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain(userQuery);
    });

    it("should include today's date", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      const today = new Date();
      const todayFormatted = today.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      expect(result).toContain(todayFormatted);
    });

    it("should include reasoning tags instructions", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("<reasoning>");
      expect(result).toContain("</reasoning>");
    });

    it("should include 3-step reasoning process", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("STEP 1");
      expect(result).toContain("STEP 2");
      expect(result).toContain("STEP 3");
    });

    it("should include extract key facts instruction", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("EXTRACT KEY FACTS");
      expect(result).toContain("Quote");
    });

    it("should include analyze instruction", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("ANALYZE");
    });

    it("should include answer instruction", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("ANSWER");
    });

    it("should include critical date logic", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("CRITICAL DATE LOGIC");
      expect(result).toContain("FUTURE");
      expect(result).toContain("PAST");
    });

    it("should include example format", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("Example Format");
      expect(result).toContain("The Outer Worlds 2");
    });

    it("should wrap user question with markers", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("===== USER'S QUESTION =====");
      expect(result).toContain("===== END USER'S QUESTION =====");
    });

    it("should include warning symbols for emphasis", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain("⚠️");
    });

    it("should end with instruction to follow steps", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);
      expect(result).toContain(
        "Now follow these steps for the user's question:"
      );
    });

    it("should handle empty search context", () => {
      const result = buildWebSearchPrompt(userQuery, "");
      expect(result).toContain(userQuery);
      expect(result).toContain("STEP 1");
    });

    it("should handle multiline user query", () => {
      const multilineQuery = "What is the weather?\nAnd the temperature?";
      const result = buildWebSearchPrompt(multilineQuery, searchContext);
      expect(result).toContain(multilineQuery);
    });

    it("should produce consistent output structure", () => {
      const result = buildWebSearchPrompt(userQuery, searchContext);

      // Check order of major sections
      const contextIndex = result.indexOf(searchContext);
      const questionIndex = result.indexOf("USER'S QUESTION");
      const step1Index = result.indexOf("STEP 1");
      const step2Index = result.indexOf("STEP 2");
      const step3Index = result.indexOf("STEP 3");
      const exampleIndex = result.indexOf("Example Format");

      expect(contextIndex).toBeLessThan(questionIndex);
      expect(questionIndex).toBeLessThan(step1Index);
      expect(step1Index).toBeLessThan(step2Index);
      expect(step2Index).toBeLessThan(step3Index);
      expect(step3Index).toBeLessThan(exampleIndex);
    });
  });
});
