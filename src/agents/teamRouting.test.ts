import { describe, expect, it } from "vitest";
import { isChangeRequest, isProjectQuestion } from "./teamRouting";

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

describe("isChangeRequest", () => {
  it.each([
    "Make add in calc.py take an optional third number, add an assert for it to test_calc.py, then run python3 test_calc.py.",
    "Running python3 test_calc.py fails. Find the bug and fix it so the test passes.",
    "Can you add a test for negative numbers?",
    "please rename f_7 to g_7 in every file",
    "Create slugify.sh",
    "The loader is slow. Refactor it to cache the index.",
    "What is wrong with add, and then fix it",
  ])("treats %j as a change", (message) => {
    expect(isChangeRequest(message)).toBe(true);
  });

  it.each([
    "What does the add function in calc.py return?",
    "Find the bug in calc.py",
    "Check that the tests pass",
    "Hi!",
    "",
  ])("does not treat %j as one", (message) => {
    expect(isChangeRequest(message)).toBe(false);
  });
});
