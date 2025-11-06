/**
 * Web Search Prompt Test Script (Simplified)
 *
 * This script simulates what prompt would be sent to the LLM
 * based on mock search results, helping diagnose hallucination issues.
 */

// ANSI color codes
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
 * Mock search results for "did outer worlds 2 come out already on ps5?"
 */
const mockSearchResults = {
  query1: {
    query: "did outer worlds 2 come out already on ps5?",
    results: [
      {
        title: "The Outer Worlds 2 - PlayStation 5 Release Date",
        snippet:
          "The Outer Worlds 2 is scheduled for release on PlayStation 5, Xbox Series X|S, and PC in 2025. The game was announced at E3 2021 and is currently in development by Obsidian Entertainment.",
        url: "https://www.gamesradar.com/outer-worlds-2-release-date/",
      },
      {
        title: "Outer Worlds 2: Everything We Know - IGN",
        snippet:
          "As of November 2025, The Outer Worlds 2 has not yet been released. The game is still in development and no specific release date has been announced beyond '2025'.",
        url: "https://www.ign.com/articles/outer-worlds-2-release-date",
      },
      {
        title: "Is The Outer Worlds 2 Out Yet? - GameSpot",
        snippet:
          "The Outer Worlds 2 is not out yet. Obsidian Entertainment has confirmed the game is still in active development for a 2025 release window on PS5, Xbox Series X|S, and PC.",
        url: "https://www.gamespot.com/articles/outer-worlds-2-release/",
      },
      {
        title: "The Outer Worlds 2 Release Date, News, and Trailers",
        snippet:
          "The Outer Worlds 2 was originally announced for a 2025 release. As of now, the game has not launched and Obsidian has not provided an exact release date.",
        url: "https://www.polygon.com/outer-worlds-2",
      },
    ],
  },
  query2: {
    query: "please check again",
    results: [
      {
        title: "How to Politely Ask Someone to Check Again",
        snippet:
          "Here are some polite ways to ask someone to verify information: 'Would you mind double-checking?', 'Could you please review this once more?', 'I'd appreciate if you could take another look.'",
        url: "https://www.grammarly.com/blog/polite-requests/",
      },
      {
        title: "Professional Email Phrases for Follow-ups",
        snippet:
          "When following up on a request, use phrases like: 'Could you please check again?', 'I wanted to follow up on my previous request', 'Would it be possible to review this again?'",
        url: "https://www.businesswriting.com/email-phrases/",
      },
    ],
  },
};

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
    finalPrompt = `${webSearchContext}`;
    finalPrompt += `\n⚠️⚠️⚠️ REMINDER: Today is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} ⚠️⚠️⚠️\n\n`;
    finalPrompt += `===== USER'S QUESTION =====\n${query}\n`;
    finalPrompt += `===== END USER'S QUESTION =====\n\n`;

    // Chain-of-Thought + Attribution approach for grounding
    finalPrompt += `⚠️ CRITICAL: You MUST follow this 3-step reasoning process ⚠️\n\n`;

    finalPrompt += `STEP 1 - EXTRACT KEY FACTS:\n`;
    finalPrompt += `List the specific facts from the search results that relate to the question.\n`;
    finalPrompt += `Quote the exact text: [Quote: "exact words from search result"]\n\n`;

    finalPrompt += `STEP 2 - ANALYZE:\n`;
    finalPrompt += `Explain what those facts mean. Pay attention to:\n`;
    finalPrompt += `- Today's date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n`;
    finalPrompt += `- CRITICAL DATE LOGIC:\n`;
    finalPrompt += `  * If scheduled date is in the FUTURE (after today) = NOT released yet\n`;
    finalPrompt += `  * If scheduled date is in the PAST (before today) = ALREADY released\n`;
    finalPrompt += `  * If results explicitly say "not yet released" = NOT released (even if date passed)\n`;
    finalPrompt += `- Example: If something was scheduled for October 29, 2025 and today is November 4, 2025, it ALREADY HAPPENED\n\n`;

    finalPrompt += `STEP 3 - ANSWER:\n`;
    finalPrompt += `Based ONLY on the facts you extracted, answer the user's question.\n`;
    finalPrompt += `If the search results don't contain the answer, say "The search results don't provide this information."\n\n`;

    finalPrompt += `Example Format:\n`;
    finalPrompt += `STEP 1: [Quote: "The Outer Worlds 2 will launch... this coming October 2025"] [Quote: "scheduled for release in late October 2025"]\n`;
    finalPrompt += `STEP 2: The game was scheduled for October 2025. Today is November 4, 2025, which is AFTER October 2025. This means the scheduled date has passed, so the game ALREADY released.\n`;
    finalPrompt += `STEP 3: Yes, The Outer Worlds 2 has been released (it came out in October 2025).\n\n`;

    finalPrompt += `Now follow these steps for the user's question:\n`;
  } else {
    finalPrompt = query;
  }

  return finalPrompt;
}

/**
 * Display the results and prompt
 */
function displayResults(query, searchData, prompt) {
  console.log("\n" + "=".repeat(100));
  console.log(
    `${colors.magenta}${colors.bright}QUERY: ${query}${colors.reset}`
  );
  console.log("=".repeat(100) + "\n");

  if (searchData.results.length === 0) {
    log(colors.red, "RESULTS", "No search results!");
    return;
  }

  // Display search results
  console.log(
    `${colors.yellow}${colors.bright}SEARCH RESULTS (${searchData.results.length} found)${colors.reset}\n`
  );
  searchData.results.forEach((result, index) => {
    console.log(
      `${colors.cyan}${colors.bright}${index + 1}. ${result.title}${colors.reset}`
    );
    console.log(`   ${result.snippet}`);
    console.log(`   ${colors.blue}${result.url}${colors.reset}\n`);
  });

  // Display the prompt
  console.log("=".repeat(100));
  console.log(
    `${colors.green}${colors.bright}FULL PROMPT SENT TO LLM (${prompt.length} chars)${colors.reset}`
  );
  console.log("=".repeat(100));
  console.log(prompt);
  console.log("=".repeat(100) + "\n");

  // Analyze the prompt
  console.log(`${colors.yellow}${colors.bright}PROMPT ANALYSIS${colors.reset}`);
  console.log(`├─ Total length: ${prompt.length} characters`);
  console.log(`├─ Number of search results: ${searchData.results.length}`);
  console.log(
    `├─ Contains current date: ${prompt.includes("Current Date:") ? `${colors.green}YES ✓${colors.reset}` : `${colors.red}NO ✗${colors.reset}`}`
  );
  console.log(
    `├─ Contains critical instructions: ${prompt.includes("CRITICAL INSTRUCTIONS") ? `${colors.green}YES ✓${colors.reset}` : `${colors.red}NO ✗${colors.reset}`}`
  );
  console.log(
    `├─ Contains absolute rules: ${prompt.includes("ABSOLUTE RULES") ? `${colors.green}YES ✓${colors.reset}` : `${colors.red}NO ✗${colors.reset}`}`
  );
  console.log(
    `└─ Has user question marker: ${prompt.includes("===== USER'S QUESTION =====") ? `${colors.green}YES ✓${colors.reset}` : `${colors.red}NO ✗${colors.reset}`}`
  );
  console.log("");
}

/**
 * Main test function
 */
function runTest() {
  console.log(
    `\n${colors.cyan}${colors.bright}╔══════════════════════════════════════════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}║                         WEB SEARCH PROMPT ANALYSIS TEST SCRIPT                                   ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}${colors.bright}╚══════════════════════════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  // Test query 1
  log(colors.magenta, "TEST 1", "Initial query about Outer Worlds 2");
  const searchData1 = mockSearchResults.query1;
  const prompt1 = buildPrompt(searchData1.query, searchData1);
  displayResults(searchData1.query, searchData1, prompt1);

  // Analysis of what LLM SHOULD answer
  console.log(
    `${colors.green}${colors.bright}EXPECTED LLM BEHAVIOR:${colors.reset}`
  );
  console.log(
    `The LLM should answer: "No, The Outer Worlds 2 has not been released yet on PS5."`
  );
  console.log(
    `It should use information from the search results that clearly state:`
  );
  console.log(`  - Game is scheduled for 2025 release`);
  console.log(`  - As of November 2025, not yet released`);
  console.log(`  - Still in active development`);
  console.log("");

  console.log(
    `${colors.red}${colors.bright}HALLUCINATION EXAMPLE (what we saw before):${colors.reset}`
  );
  console.log(
    `"Yes, The Outer Worlds 2 is now available for PS5. It launched globally on October 29, 2023."`
  );
  console.log(
    `This is WRONG - it ignores the search results and uses outdated training data.`
  );
  console.log("\n\n");

  // Test query 2 (the problematic follow-up)
  log(colors.magenta, "TEST 2", 'Follow-up query "please check again"');
  const searchData2 = mockSearchResults.query2;
  const prompt2 = buildPrompt(searchData2.query, searchData2);
  displayResults(searchData2.query, searchData2, prompt2);

  // Analysis of the problem
  console.log(
    `${colors.red}${colors.bright}PROBLEM IDENTIFIED:${colors.reset}`
  );
  console.log(
    `When user asks "please check again", DuckDuckGo returns results about "how to politely ask someone to check"`
  );
  console.log(
    `Instead of re-checking the previous topic (Outer Worlds 2), it searches for the literal phrase.`
  );
  console.log("");
  console.log(`${colors.yellow}${colors.bright}ROOT CAUSE:${colors.reset}`);
  console.log(`  1. Web search doesn't understand follow-up context`);
  console.log(`  2. It treats "please check again" as a new, standalone query`);
  console.log(`  3. DuckDuckGo interprets it as asking about polite requests`);
  console.log(`  4. LLM receives completely unrelated search results`);
  console.log("");
  console.log(`${colors.green}${colors.bright}SOLUTIONS:${colors.reset}`);
  console.log(
    `  A) Detect follow-up questions and skip web search (use conversation context only)`
  );
  console.log(
    `  B) Include previous query context when searching: "outer worlds 2 ps5 release check"`
  );
  console.log(
    `  C) Disable web search for very short/vague queries like "please check again"`
  );
  console.log(`  D) Add conversation context to follow-up searches`);
  console.log("\n");

  // Summary
  console.log("=".repeat(100));
  console.log(`${colors.cyan}${colors.bright}SUMMARY${colors.reset}`);
  console.log("=".repeat(100));
  console.log("");
  console.log(
    `${colors.yellow}Issue #1: LLM Ignoring Search Results${colors.reset}`
  );
  console.log(
    `  - Prompt clearly states "ABSOLUTE RULES: ONLY use information from snippets"`
  );
  console.log(`  - Search results say "not yet released"`);
  console.log(`  - LLM says "released on October 29, 2023"`);
  console.log(
    `  ${colors.red}→ Model is favoring training data over explicit instructions${colors.reset}`
  );
  console.log("");
  console.log(
    `${colors.yellow}Issue #2: Follow-up Context Loss${colors.reset}`
  );
  console.log(
    `  - User asks "please check again" expecting to re-check Outer Worlds 2`
  );
  console.log(`  - System searches for "please check again" literally`);
  console.log(`  - Returns unrelated results about polite requests`);
  console.log(
    `  ${colors.red}→ No conversation context in search queries${colors.reset}`
  );
  console.log("");
  console.log(
    `${colors.green}${colors.bright}RECOMMENDED FIXES:${colors.reset}`
  );
  console.log(
    `  1. ${colors.cyan}Lower temperature${colors.reset} for web search queries (0.3 instead of 0.7)`
  );
  console.log(
    `  2. ${colors.cyan}Add system message${colors.reset} specifically for web search mode`
  );
  console.log(
    `  3. ${colors.cyan}Detect follow-ups${colors.reset} and handle differently`
  );
  console.log(
    `  4. ${colors.cyan}Try different model${colors.reset} if current one ignores instructions`
  );
  console.log("");
  console.log("=".repeat(100));
  console.log("");

  log(
    colors.green,
    "COMPLETE",
    "Test finished! Review the prompts above to see what the LLM receives."
  );
  console.log("");
}

// Run the test
try {
  runTest();
} catch (error) {
  log(colors.red, "ERROR", error.message);
  console.error(error);
  process.exit(1);
}
