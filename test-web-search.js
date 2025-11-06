/**
 * Web Search Flow Test Script
 *
 * This script tests the web search functionality and shows exactly what
 * prompt is being sent to the LLM, helping diagnose hallucination issues.
 */

import { chromium } from "playwright";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for better output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function log(color, label, message) {
  console.log(`${color}${colors.bright}[${label}]${colors.reset} ${message}`);
}

/**
 * Simulate the web search service
 */
async function performSearch(query) {
  log(colors.cyan, "SEARCH", `Query: "${query}"`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Add stealth mode
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {} };
  });

  try {
    // Navigate to DuckDuckGo
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    log(colors.blue, "FETCH", `Navigating to DuckDuckGo...`);

    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 5000,
    });

    // Parse search results
    const results = await page.evaluate(() => {
      const resultElements = document.querySelectorAll(".result");
      const parsed = [];

      resultElements.forEach((element, index) => {
        if (index >= 10) return; // Max 10 results

        const titleEl = element.querySelector(".result__a");
        const snippetEl = element.querySelector(".result__snippet");
        const urlEl = element.querySelector(".result__url");

        if (titleEl) {
          parsed.push({
            title: titleEl.textContent.trim(),
            snippet: snippetEl ? snippetEl.textContent.trim() : "",
            url: titleEl.href || urlEl?.textContent.trim() || "",
          });
        }
      });

      return parsed;
    });

    log(colors.green, "RESULTS", `Found ${results.length} search results`);

    // Clean URLs (remove DuckDuckGo redirect)
    const cleanedResults = results.map((r) => {
      let url = r.url;
      if (url.includes("duckduckgo.com/l/")) {
        try {
          const urlObj = new URL(url);
          const uddg = urlObj.searchParams.get("uddg");
          if (uddg) url = decodeURIComponent(uddg);
        } catch (e) {
          // Keep original URL if parsing fails
        }
      }
      if (url.startsWith("//")) {
        url = "https:" + url;
      }
      return { ...r, url };
    });

    await browser.close();

    return {
      results: cleanedResults,
      contents: [], // We'll skip page fetching for this test
    };
  } catch (error) {
    log(colors.red, "ERROR", `Search failed: ${error.message}`);
    await browser.close();
    return { results: [], contents: [] };
  }
}

/**
 * Build the prompt that would be sent to the LLM
 */
function buildPrompt(query, searchData) {
  let webSearchContext = "";

  if (searchData.results.length > 0) {
    webSearchContext = "\n\n--- Web Search Results ---\n";
    webSearchContext += `Current Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\n\n`;

    searchData.results.forEach((result, index) => {
      webSearchContext += `\n${index + 1}. ${result.title}\n`;
      webSearchContext += `   ${result.snippet}\n`;
    });

    webSearchContext += "\n--- End of Search Results ---\n\n";
    webSearchContext += "⚠️ CRITICAL INSTRUCTIONS - READ CAREFULLY ⚠️\n\n";
    webSearchContext +=
      "You are answering based on CURRENT LIVE WEB SEARCH SNIPPETS shown above. These were just fetched from the internet.\n\n";
    webSearchContext += "ABSOLUTE RULES:\n";
    webSearchContext += "1. ONLY use information from the snippets above\n";
    webSearchContext +=
      "2. Search results OVERRIDE your training data - use them instead\n";
    webSearchContext += "3. DO NOT invent information not in the snippets\n";
    webSearchContext +=
      "4. DO NOT list sources - they will be shown separately\n";
    webSearchContext +=
      '5. If snippets are unclear or limited, say "Based on the search results..."\n';
    webSearchContext +=
      "6. Today's date is: " +
      new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }) +
      "\n\n";
    webSearchContext += "Answer using ONLY the snippets above.\n\n";
  }

  let finalPrompt = "";

  if (webSearchContext) {
    finalPrompt = `${webSearchContext}===== USER'S QUESTION =====\n${query}\n\n`;
    finalPrompt += `IMPORTANT: Answer the user's question using ONLY the search results provided above. Do not interpret the question as asking for advice on how to phrase requests. Answer the actual question about the topic being searched.\n`;
  } else {
    finalPrompt = query;
  }

  return finalPrompt;
}

/**
 * Display the results and prompt
 */
function displayResults(query, searchData, prompt) {
  console.log("\n" + "=".repeat(80));
  log(colors.magenta, "QUERY", query);
  console.log("=".repeat(80) + "\n");

  if (searchData.results.length === 0) {
    log(colors.red, "RESULTS", "No search results found!");
    return;
  }

  // Display search results
  console.log(
    `${colors.yellow}${colors.bright}SEARCH RESULTS (${searchData.results.length})${colors.reset}\n`
  );
  searchData.results.forEach((result, index) => {
    console.log(`${colors.cyan}${index + 1}. ${result.title}${colors.reset}`);
    console.log(
      `   ${result.snippet.substring(0, 150)}${result.snippet.length > 150 ? "..." : ""}`
    );
    console.log(`   ${colors.blue}${result.url}${colors.reset}\n`);
  });

  // Display the prompt
  console.log("=".repeat(80));
  console.log(
    `${colors.green}${colors.bright}PROMPT SENT TO LLM${colors.reset}`
  );
  console.log("=".repeat(80));
  console.log(prompt);
  console.log("=".repeat(80) + "\n");

  // Analyze the prompt
  console.log(`${colors.yellow}${colors.bright}ANALYSIS${colors.reset}`);
  console.log(`Prompt length: ${prompt.length} characters`);
  console.log(`Number of results: ${searchData.results.length}`);
  console.log(
    `Contains date context: ${prompt.includes("Current Date:") ? "YES ✓" : "NO ✗"}`
  );
  console.log(
    `Contains critical instructions: ${prompt.includes("CRITICAL INSTRUCTIONS") ? "YES ✓" : "NO ✗"}`
  );
  console.log(
    `Contains absolute rules: ${prompt.includes("ABSOLUTE RULES") ? "YES ✓" : "NO ✗"}`
  );
  console.log("");
}

/**
 * Save prompt to file for analysis
 */
async function savePrompt(query, prompt) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `prompt-${timestamp}.txt`;
  const fs = await import("fs");

  const content = `QUERY: ${query}\n${"=".repeat(80)}\n\n${prompt}`;
  fs.writeFileSync(filename, content);

  log(colors.green, "SAVED", `Prompt saved to ${filename}`);
}

/**
 * Main test function
 */
async function runTest() {
  console.log(
    `\n${colors.cyan}${colors.bright}╔════════════════════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}║                    WEB SEARCH FLOW TEST SCRIPT                             ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}╚════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  // Test queries
  const testQueries = [
    "did outer worlds 2 come out already on ps5?",
    "please check again", // Follow-up query
  ];

  for (const query of testQueries) {
    log(colors.magenta, "TEST", `Testing query: "${query}"`);

    // Perform search
    const searchData = await performSearch(query);

    // Build prompt
    const prompt = buildPrompt(query, searchData);

    // Display results
    displayResults(query, searchData, prompt);

    // Wait a bit between queries
    if (testQueries.indexOf(query) < testQueries.length - 1) {
      console.log(
        `\n${colors.yellow}Waiting 3 seconds before next query...${colors.reset}\n`
      );
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log(
    `${colors.green}${colors.bright}✓ Test complete!${colors.reset}\n`
  );

  log(
    colors.yellow,
    "NOTE",
    "The prompts above show exactly what the LLM receives."
  );
  log(
    colors.yellow,
    "NOTE",
    "If the LLM ignores these instructions, the issue is with the model itself."
  );
  console.log("");
}

// Run the test
runTest().catch((error) => {
  log(colors.red, "FATAL", error.message);
  console.error(error);
  process.exit(1);
});
