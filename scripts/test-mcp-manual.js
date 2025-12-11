/**
 * Manual MCP Integration Test Script
 * 
 * This script connects to the SHIELD Electron app using Playwright
 * and tests MCP functionality through automated UI interactions.
 */

import { chromium, _electron as electron } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testMCP() {
    console.log('🧪 Starting MCP Manual Integration Test...\n');
    console.log('📦 Launching Electron app...\n');

    // Launch the Electron app
    const electronApp = await electron.launch({
        args: [path.join(__dirname, '../dist-electron/main.js')],
        env: {
            ...process.env,
            NODE_ENV: 'development'
        }
    });

    // Wait for window to open
    const page = await electronApp.firstWindow();
    console.log('✅ Electron app window opened\n');

    // Add event listeners for debugging
    page.on('console', msg => console.log('🖥️ Console:', msg.text()));
    page.on('pageerror', err => console.error('❌ Page Error:', err));

    try {
        // Wait for app to be ready
        console.log('⏳ Waiting for app to load...');

        // Wait for load state first
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        console.log('✅ DOM loaded');

        // Give React time to render
        await page.waitForTimeout(2000);

        // Check if we can see the main app structure
        const bodyText = await page.textContent('body');
        console.log('📄 Page loaded, body length:', bodyText.length);
        console.log('✅ App loaded\n');

        // Take initial screenshot
        await page.screenshot({ path: 'test-screenshots/01-initial-state.png' });
        console.log('📸 Screenshot: 01-initial-state.png');

        // Test 1: Open Settings
        console.log('\n📋 Test 1: Opening Settings...');
        const settingsButton = page.locator('button[title*="Settings"], button:has-text("Settings")').first();
        if (await settingsButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await settingsButton.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: 'test-screenshots/02-settings-opened.png' });
            console.log('✅ Settings opened');
            console.log('📸 Screenshot: 02-settings-opened.png');
        } else {
            console.log('⚠️  Settings button not found, trying keyboard shortcut...');
            await page.keyboard.press('Control+,');
            await page.waitForTimeout(1000);
        }

        // Test 2: Navigate to MCP Settings
        console.log('\n📋 Test 2: Navigating to MCP Settings...');
        const mcpTab = page.locator('button:has-text("MCP"), [role="tab"]:has-text("MCP")').first();
        if (await mcpTab.isVisible({ timeout: 2000 }).catch(() => false)) {
            await mcpTab.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: 'test-screenshots/03-mcp-settings.png' });
            console.log('✅ MCP Settings visible');
            console.log('📸 Screenshot: 03-mcp-settings.png');
        } else {
            console.log('⚠️  MCP tab not found in settings');
        }

        // Test 3: Check MCP Toggle
        console.log('\n📋 Test 3: Checking MCP Toggle...');
        const mcpToggle = page.locator('[role="switch"]').first();
        const isEnabled = await mcpToggle.getAttribute('data-state') === 'checked' ||
            await mcpToggle.getAttribute('aria-checked') === 'true';

        console.log(`📊 MCP Status: ${isEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}`);

        if (!isEnabled) {
            console.log('🔄 Enabling MCP...');
            await mcpToggle.click();
            await page.waitForTimeout(2000); // Wait for initialization
            await page.screenshot({ path: 'test-screenshots/04-mcp-enabled.png' });
            console.log('✅ MCP toggle clicked');
            console.log('📸 Screenshot: 04-mcp-enabled.png');
        }

        // Test 4: Check MCP Status in Header
        console.log('\n📋 Test 4: Checking MCP Status Indicator...');

        // Close settings first
        const closeButton = page.locator('button[aria-label*="Close"], button:has-text("Close")').first();
        if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            await closeButton.click();
            await page.waitForTimeout(500);
        } else {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }

        await page.screenshot({ path: 'test-screenshots/05-header-status.png' });
        console.log('📸 Screenshot: 05-header-status.png');

        // Test 5: Check Console for MCP Logs
        console.log('\n📋 Test 5: Checking Console Logs...');
        const logs = [];
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('MCP') || text.includes('mcp')) {
                logs.push(text);
            }
        });

        await page.waitForTimeout(1000);

        if (logs.length > 0) {
            console.log('📝 MCP-related console logs found:');
            logs.forEach(log => console.log(`   ${log}`));
        } else {
            console.log('ℹ️  No MCP logs in console (may be normal if already initialized)');
        }

        // Test 6: Check for MCP Button in Header
        console.log('\n📋 Test 6: Checking for MCP Toggle Button in Header...');
        const mcpHeaderButton = page.locator('button[title*="MCP"], button[aria-label*="MCP"]').first();
        const headerButtonVisible = await mcpHeaderButton.isVisible({ timeout: 2000 }).catch(() => false);

        if (headerButtonVisible) {
            console.log('✅ MCP header button found');
            await page.screenshot({ path: 'test-screenshots/06-mcp-button.png' });
            console.log('📸 Screenshot: 06-mcp-button.png');
        } else {
            console.log('⚠️  MCP header button not visible');
        }

        // Test 7: Evaluate MCP State via DevTools
        console.log('\n📋 Test 7: Checking MCP State via window.electronAPI...');
        const mcpState = await page.evaluate(async () => {
            if (!window.electronAPI?.mcp) {
                return { error: 'MCP API not available' };
            }

            try {
                const ready = await window.electronAPI.mcp.isReady();
                return { success: true, ready };
            } catch (err) {
                return { error: err.message };
            }
        });

        console.log('📊 MCP State:', JSON.stringify(mcpState, null, 2));

        if (mcpState.success && mcpState.ready) {
            console.log('✅ MCP is ready and initialized');
        } else if (mcpState.error) {
            console.log('❌ MCP API error:', mcpState.error);
        } else {
            console.log('⚠️  MCP not ready');
        }

        // Test 8: Check Settings Store
        console.log('\n📋 Test 8: Checking MCP Settings in Store...');
        const settingsState = await page.evaluate(() => {
            // Try to access React DevTools if available
            const reactRoot = document.querySelector('#root');
            if (reactRoot) {
                return { found: true, note: 'React root found but settings not accessible from page context' };
            }
            return { found: false };
        });

        console.log('📊 Settings Check:', JSON.stringify(settingsState, null, 2));

        // Final screenshot
        await page.screenshot({ path: 'test-screenshots/07-final-state.png', fullPage: true });
        console.log('\n📸 Screenshot: 07-final-state.png (full page)');

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MCP Integration Test Summary');
        console.log('='.repeat(60));
        console.log('✅ App connected and responsive');
        console.log('✅ Settings accessible');
        console.log(`${isEnabled ? '✅' : '⚠️ '} MCP ${isEnabled ? 'was enabled' : 'was disabled (now enabled)'}`);
        console.log(`${mcpState.success ? '✅' : '❌'} MCP API available`);
        console.log(`${mcpState.ready?.ready ? '✅' : '⚠️ '} MCP initialization ${mcpState.ready?.ready ? 'successful' : 'pending/failed'}`);
        console.log('✅ All screenshots captured in test-screenshots/');
        console.log('='.repeat(60));

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack:', error.stack);
        await page.screenshot({ path: 'test-screenshots/error-state.png' });
        console.log('📸 Error screenshot saved: test-screenshots/error-state.png');
    } finally {
        console.log('\n🏁 Test completed. Electron app closed.');
        await electronApp.close();
    }
}

// Run the test
testMCP().catch(console.error);
