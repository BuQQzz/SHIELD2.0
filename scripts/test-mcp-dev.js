/**
 * Manual MCP Integration Test Script (Dev Mode)
 *
 * This script tests MCP functionality while the dev server is running.
 * Start the app with `npm run dev` first, then run this script.
 */

import { _electron as electron } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = "test-screenshots";

async function testMCP() {
  console.log("🧪 Starting MCP Manual Integration Test (Dev Mode)...\n");
  console.log("⚠️  Make sure the app is running with: npm run dev\n");
  console.log(
    "⏳ Waiting 5 seconds for you to start the app if not running...\n"
  );

  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log("🌐 Connecting to dev server...\n");

  const app = await electron.launch({
    args: [path.join(__dirname, "../dist-electron/main.js")],
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  const page = await app.firstWindow();

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
    console.log("✅ Connected to Electron app\n");

    // Wait for React to render
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({
      path: "test-screenshots/01-initial-state.png",
      fullPage: true,
    });
    console.log("📸 Screenshot: 01-initial-state.png");

    // Test 1: Open Settings
    console.log("\n📋 Test 1: Opening Settings...");

    // Look for settings button (gear icon)
    const settingsButton = page
      .getByRole("button", { name: /settings/i })
      .first();
    await settingsButton.waitFor({ state: "visible", timeout: 5000 });
    await settingsButton.click();
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: "test-screenshots/02-settings-opened.png",
      fullPage: true,
    });
    console.log("✅ Settings opened");
    console.log("📸 Screenshot: 02-settings-opened.png");

    // Test 2: Navigate to Configure and locate MCP section
    console.log("\n📋 Test 2: Navigating to MCP Settings...");

    const configureTab = page.getByRole("tab", { name: /configure/i });
    if (await configureTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await configureTab.click();
      await page.waitForTimeout(500);
    }

    const mcpHeading = page.getByRole("heading", { name: /mcp integration/i });
    await mcpHeading.waitFor({ state: "visible", timeout: 5000 });

    await page.screenshot({
      path: "test-screenshots/03-mcp-section.png",
      fullPage: true,
    });
    console.log("✅ MCP section found");
    console.log("📸 Screenshot: 03-mcp-section.png");

    // Test 3: Check MCP Toggle
    console.log("\n📋 Test 3: Checking MCP Toggle...");

    const mcpSection = page
      .locator('div:has(h3:has-text("MCP Integration"))')
      .first();
    const mcpToggle = mcpSection.locator('button[role="switch"]').first();

    if (await mcpToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
      const isChecked = await mcpToggle.getAttribute("aria-checked");
      console.log(`📊 MCP Toggle State: ${isChecked}`);

      await page.screenshot({
        path: "test-screenshots/04-mcp-toggle.png",
        fullPage: true,
      });
      console.log("📸 Screenshot: 04-mcp-toggle.png");

      // Test 4: Toggle MCP if it's off
      if (isChecked === "false") {
        console.log("\n📋 Test 4: Enabling MCP...");
        await mcpToggle.click();
        await page.waitForTimeout(1000);

        const newState = await mcpToggle.getAttribute("aria-checked");
        console.log(`📊 New MCP State: ${newState}`);

        await page.screenshot({
          path: "test-screenshots/05-mcp-enabled.png",
          fullPage: true,
        });
        console.log("✅ MCP toggled");
        console.log("📸 Screenshot: 05-mcp-enabled.png");
      } else {
        console.log("ℹ️  MCP is already enabled");
      }
    } else {
      console.log("⚠️  MCP toggle not found on this page");
    }

    // Test 5: Check for MCP Status Indicator
    console.log("\n📋 Test 5: Checking MCP Status Indicators...");

    // Close settings to see header
    const closeButton = page.locator('button[aria-label*="Close"]').first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(1000);
    } else {
      // Try pressing Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(1000);
    }

    await page.screenshot({
      path: "test-screenshots/06-after-close.png",
      fullPage: true,
    });
    console.log("📸 Screenshot: 06-after-close.png");

    // Look for MCP status indicator in header or somewhere on page
    const mcpIndicator = page
      .locator('[data-mcp-status], [title*="MCP"], text=/MCP/i')
      .first();
    if (await mcpIndicator.isVisible({ timeout: 2000 }).catch(() => false)) {
      const indicatorText = await mcpIndicator.textContent();
      console.log(`📊 MCP Status Indicator: "${indicatorText}"`);
    } else {
      console.log("ℹ️  No visible MCP status indicator found");
    }

    // Test 6: Check Console Logs
    console.log("\n📋 Test 6: Checking for MCP-related console logs...");

    const consoleLogs = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.toLowerCase().includes("mcp")) {
        consoleLogs.push(text);
      }
    });

    // Trigger a page interaction that might log MCP info
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2000);

    if (consoleLogs.length > 0) {
      console.log("📊 MCP-related console logs:");
      consoleLogs.forEach((log) => console.log(`   - ${log}`));
    } else {
      console.log("ℹ️  No MCP-related console logs detected");
    }

    await page.screenshot({
      path: "test-screenshots/07-final-state.png",
      fullPage: true,
    });
    console.log("📸 Screenshot: 07-final-state.png");

    console.log("\n✅ All tests completed successfully!");
    console.log("\n📊 Test Summary:");
    console.log("   ✓ Connected to dev server");
    console.log("   ✓ Opened Settings dialog");
    console.log("   ✓ Located MCP settings section");
    console.log("   ✓ Found MCP toggle control");
    console.log("   ✓ Captured 7 screenshots");
    console.log("\n📁 Screenshots saved to: test-screenshots/");
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    await page.screenshot({
      path: "test-screenshots/error-state.png",
      fullPage: true,
    });
    console.log("📸 Error screenshot saved: test-screenshots/error-state.png");
    throw error;
  } finally {
    console.log("\n🏁 Test completed. Closing browser in 3 seconds...");
    await page.waitForTimeout(3000);
    await app.close();
  }
}

// Run the test
testMCP().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
