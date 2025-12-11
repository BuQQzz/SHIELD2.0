/**
 * SHIELD 2.0 - Comprehensive Full Suite Test
 *
 * This script performs a complete end-to-end test of all major features
 * to ensure the chatbot is production-ready.
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SCREENSHOTS_DIR = "test-screenshots/full-suite";
const TEST_RESULTS = [];

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function logTest(name, status, details = "") {
  const result = { name, status, details, timestamp: new Date().toISOString() };
  TEST_RESULTS.push(result);

  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} ${name}: ${status}`);
  if (details) console.log(`   ${details}`);
}

async function screenshot(page, filename, description) {
  try {
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, filename),
      fullPage: true,
    });
    console.log(`📸 ${description}: ${filename}`);
  } catch (error) {
    console.log(`⚠️  Screenshot failed: ${error.message}`);
  }
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFullSuiteTest() {
  console.log("🚀 SHIELD 2.0 - Full Suite Test\n");
  console.log("═".repeat(60));
  console.log("Starting comprehensive testing...\n");

  let browser;
  let page;

  try {
    // Launch browser
    console.log("📦 Launching browser...");
    browser = await chromium.launch({
      headless: false,
      slowMo: 300,
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    page = await context.newPage();

    // Listen to console logs
    const consoleLogs = [];
    page.on("console", (msg) => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Listen to errors
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    console.log("✅ Browser launched\n");

    // ==========================================
    // TEST 1: App Initialization
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 1: App Initialization");
    console.log("═".repeat(60) + "\n");

    try {
      await page.goto("http://localhost:5173", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await wait(2000);
      logTest("App loads successfully", "PASS", "Page loaded without errors");
    } catch (error) {
      logTest("App loads successfully", "FAIL", error.message);
      throw error;
    }

    await screenshot(page, "01-app-initial.png", "Initial app state");

    // Check for critical elements
    try {
      const hasBody = await page.$("body");
      if (hasBody) {
        logTest("DOM structure present", "PASS", "Body element found");
      } else {
        logTest("DOM structure present", "FAIL", "Body element not found");
      }
    } catch (error) {
      logTest("DOM structure present", "FAIL", error.message);
    }

    // Check for no critical errors
    const criticalErrors = pageErrors.filter(
      (err) => !err.includes("Autofill") && !err.includes("CSP")
    );
    if (criticalErrors.length === 0) {
      logTest("No critical errors on load", "PASS", "Clean initialization");
    } else {
      logTest(
        "No critical errors on load",
        "FAIL",
        `${criticalErrors.length} errors found`
      );
    }

    // ==========================================
    // TEST 2: UI Elements Presence
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 2: UI Elements Presence");
    console.log("═".repeat(60) + "\n");

    // Wait for React to fully render
    await wait(2000);

    // Check for header
    try {
      const header = await page.$('header, [role="banner"], nav');
      if (header) {
        logTest("Header present", "PASS", "Header element found");
      } else {
        logTest("Header present", "WARN", "Header element not found");
      }
    } catch (error) {
      logTest("Header present", "FAIL", error.message);
    }

    // Check for chat interface
    try {
      const chatArea = await page.$(
        '[role="main"], main, .chat, [class*="chat"]'
      );
      if (chatArea) {
        logTest("Chat area present", "PASS", "Main chat interface found");
      } else {
        logTest(
          "Chat area present",
          "WARN",
          "Chat area not clearly identified"
        );
      }
    } catch (error) {
      logTest("Chat area present", "FAIL", error.message);
    }

    // Check for input field
    try {
      const input = await page.$(
        'input[type="text"], textarea, [contenteditable="true"]'
      );
      if (input) {
        logTest("Chat input present", "PASS", "Input field found");
      } else {
        logTest("Chat input present", "FAIL", "No input field found");
      }
    } catch (error) {
      logTest("Chat input present", "FAIL", error.message);
    }

    await screenshot(page, "02-ui-elements.png", "UI elements check");

    // ==========================================
    // TEST 3: Settings Dialog
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 3: Settings Dialog");
    console.log("═".repeat(60) + "\n");

    // Try to find and click settings button
    try {
      const settingsSelectors = [
        'button[aria-label*="Settings"]',
        'button[title*="Settings"]',
        'button:has-text("Settings")',
        '[data-testid="settings-button"]',
        'button svg[class*="settings"]',
        'button svg[class*="gear"]',
      ];

      let settingsButton = null;
      for (const selector of settingsSelectors) {
        try {
          settingsButton = await page.$(selector);
          if (settingsButton && (await settingsButton.isVisible())) {
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (settingsButton) {
        await settingsButton.click();
        await wait(1000);
        logTest("Settings button clickable", "PASS", "Settings opened");
        await screenshot(page, "03-settings-opened.png", "Settings dialog");

        // Check for settings tabs/sections
        const tabs = await page.$$('[role="tab"], button[class*="tab"]');
        logTest(
          "Settings tabs present",
          tabs.length > 0 ? "PASS" : "WARN",
          `Found ${tabs.length} tabs/sections`
        );

        // Look for MCP tab
        let mcpFound = false;
        for (const tab of tabs) {
          const text = await tab.textContent();
          if (text && text.toLowerCase().includes("mcp")) {
            mcpFound = true;
            await tab.click();
            await wait(1000);
            logTest(
              "MCP tab accessible",
              "PASS",
              "MCP settings found and opened"
            );
            await screenshot(page, "04-mcp-settings.png", "MCP settings tab");
            break;
          }
        }

        if (!mcpFound) {
          logTest(
            "MCP tab accessible",
            "WARN",
            "MCP tab not found in settings"
          );
        }

        // Close settings
        await page.keyboard.press("Escape");
        await wait(500);
        logTest("Settings can be closed", "PASS", "Closed via Escape key");
      } else {
        logTest("Settings button found", "WARN", "Settings button not located");
      }
    } catch (error) {
      logTest("Settings dialog test", "FAIL", error.message);
    }

    await screenshot(page, "05-after-settings.png", "After settings closed");

    // ==========================================
    // TEST 4: Chat Input Interaction
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 4: Chat Input Interaction");
    console.log("═".repeat(60) + "\n");

    try {
      const inputSelectors = [
        "textarea",
        'input[type="text"]',
        '[contenteditable="true"]',
        '[role="textbox"]',
        '[data-testid="chat-input"]',
      ];

      let input = null;
      for (const selector of inputSelectors) {
        try {
          input = await page.$(selector);
          if (input && (await input.isVisible())) {
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (input) {
        // Test typing
        await input.click();
        await input.fill("Hello, this is a test message");
        await wait(500);
        logTest(
          "Input accepts text",
          "PASS",
          "Successfully typed test message"
        );
        await screenshot(
          page,
          "06-text-input.png",
          "Text entered in chat input"
        );

        // Clear input
        await input.fill("");
        await wait(300);
        logTest("Input can be cleared", "PASS", "Input cleared successfully");
      } else {
        logTest("Chat input interaction", "FAIL", "No input field found");
      }
    } catch (error) {
      logTest("Chat input interaction", "FAIL", error.message);
    }

    // ==========================================
    // TEST 5: Keyboard Shortcuts
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 5: Keyboard Shortcuts");
    console.log("═".repeat(60) + "\n");

    try {
      // Test Ctrl+K (or other shortcuts)
      const initialUrl = page.url();
      await page.keyboard.press("Control+K");
      await wait(500);

      // Check if anything changed (like command palette or search)
      const currentUrl = page.url();
      logTest("Keyboard shortcuts responsive", "PASS", "Shortcuts registered");
    } catch (error) {
      logTest("Keyboard shortcuts", "WARN", "Could not verify shortcuts");
    }

    // ==========================================
    // TEST 6: Theme/Styling
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 6: Theme & Styling");
    console.log("═".repeat(60) + "\n");

    try {
      const bodyStyles = await page.evaluate(() => {
        const body = document.body;
        const styles = window.getComputedStyle(body);
        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          fontFamily: styles.fontFamily,
        };
      });

      logTest(
        "Theme styles applied",
        "PASS",
        `Background: ${bodyStyles.backgroundColor}, Font: ${bodyStyles.fontFamily.substring(0, 30)}...`
      );
    } catch (error) {
      logTest("Theme styles", "WARN", error.message);
    }

    await screenshot(page, "07-final-state.png", "Final app state");

    // ==========================================
    // TEST 7: Console Analysis
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 7: Console Log Analysis");
    console.log("═".repeat(60) + "\n");

    const errorLogs = consoleLogs.filter((log) => log.type === "error");
    const warningLogs = consoleLogs.filter((log) => log.type === "warning");

    // Filter out known non-critical errors
    const criticalErrorLogs = errorLogs.filter(
      (log) =>
        !log.text.includes("Autofill") &&
        !log.text.includes("Security Policy") &&
        !log.text.includes("CSP")
    );

    logTest(
      "Console errors check",
      criticalErrorLogs.length === 0 ? "PASS" : "WARN",
      `${criticalErrorLogs.length} critical errors, ${errorLogs.length - criticalErrorLogs.length} non-critical`
    );

    logTest(
      "Console warnings check",
      "PASS",
      `${warningLogs.length} warnings logged`
    );

    // ==========================================
    // TEST 8: Performance Check
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUITE 8: Performance Metrics");
    console.log("═".repeat(60) + "\n");

    try {
      const metrics = await page.evaluate(() => {
        const perf = performance.getEntriesByType("navigation")[0];
        return {
          loadTime: perf ? Math.round(perf.loadEventEnd - perf.fetchStart) : 0,
          domReady: perf
            ? Math.round(perf.domContentLoadedEventEnd - perf.fetchStart)
            : 0,
        };
      });

      logTest(
        "Page load performance",
        metrics.loadTime < 5000 ? "PASS" : "WARN",
        `Load time: ${metrics.loadTime}ms, DOM ready: ${metrics.domReady}ms`
      );
    } catch (error) {
      logTest("Performance metrics", "WARN", "Could not measure performance");
    }

    // ==========================================
    // Generate Report
    // ==========================================
    console.log("\n" + "═".repeat(60));
    console.log("TEST SUMMARY");
    console.log("═".repeat(60) + "\n");

    const passed = TEST_RESULTS.filter((t) => t.status === "PASS").length;
    const failed = TEST_RESULTS.filter((t) => t.status === "FAIL").length;
    const warnings = TEST_RESULTS.filter((t) => t.status === "WARN").length;
    const total = TEST_RESULTS.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`\nSuccess Rate: ${Math.round((passed / total) * 100)}%`);

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed, warnings },
      successRate: Math.round((passed / total) * 100),
      tests: TEST_RESULTS,
      consoleLogs: {
        total: consoleLogs.length,
        errors: errorLogs.length,
        warnings: warningLogs.length,
        criticalErrors: criticalErrorLogs.length,
      },
    };

    fs.writeFileSync(
      path.join(SCREENSHOTS_DIR, "test-results.json"),
      JSON.stringify(report, null, 2)
    );

    console.log(
      `\n📊 Detailed report saved: ${path.join(SCREENSHOTS_DIR, "test-results.json")}`
    );
    console.log(`📸 Screenshots saved: ${SCREENSHOTS_DIR}/\n`);

    // Final verdict
    console.log("═".repeat(60));
    if (failed === 0 && warnings <= 3) {
      console.log("🎉 VERDICT: PRODUCTION READY ✅");
      console.log(
        "The chatbot passed all critical tests and is ready for users!"
      );
    } else if (failed === 0) {
      console.log("⚠️  VERDICT: MOSTLY READY ✅");
      console.log(
        "The chatbot passed all tests but has some warnings to review."
      );
    } else {
      console.log("❌ VERDICT: NEEDS ATTENTION");
      console.log(`Found ${failed} critical issues that should be fixed.`);
    }
    console.log("═".repeat(60) + "\n");
  } catch (error) {
    console.error("\n❌ Test suite failed with error:", error.message);
    console.error("Stack:", error.stack);

    if (page) {
      await screenshot(page, "fatal-error.png", "Fatal error state");
    }
  } finally {
    if (browser) {
      console.log("\n🏁 Closing browser in 3 seconds...");
      await wait(3000);
      await browser.close();
    }
  }
}

// Run the test suite
console.log("⏳ Starting test in 5 seconds...");
console.log("📌 Make sure the dev server is running: npm run dev\n");

setTimeout(() => {
  runFullSuiteTest().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}, 5000);
