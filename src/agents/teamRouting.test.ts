import { describe, expect, it } from "vitest";
import { isProjectQuestion } from "./teamRouting";

describe("isProjectQuestion", () => {
  it.each([
    "What does the add function in calc.py return?",
    "Where is the test for add and what does it check?",
    "Is there anything in this project that handles negative numbers?",
    "Explain how the loader works",
    "does calc.py have a bug",
    "Why does the build take so long?",
  ])("treats %j as a question", (message) => {
    expect(isProjectQuestion(message)).toBe(true);
  });

  it.each([
    "Make add in calc.py take an optional third number",
    "Running python3 test_calc.py fails. Find the bug and fix it so the test passes.",
    "Can you add a test for negative numbers?",
    "Create slugify.sh",
    "Rename f_7 to g_7 in every file",
    "What is wrong with add, and then fix it",
    "Check that the tests pass",
    "Find the bug in calc.py",
    "",
  ])("does not treat %j as one", (message) => {
    expect(isProjectQuestion(message)).toBe(false);
  });
});
