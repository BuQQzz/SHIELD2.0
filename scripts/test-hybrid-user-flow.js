/**
 * Hybrid User Flow Smoke Test
 *
 * Covers:
 * 1) Model picker access and download dialog visibility
 * 2) Model download pipeline start/cancel (smoke)
 * 3) MCP initialize/list-tools/call-tool flow
 */

import { _electron as electron } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printResult(step, ok, details) {
    const icon = ok ? "✅" : "❌";
    console.log(`${icon} ${step}: ${details}`);
}

async function run() {
    console.log("🧪 Hybrid user-flow smoke test starting...\n");

    const app = await electron.launch({
        args: [path.join(__dirname, "../dist-electron/main.js")],
        env: {
            ...process.env,
            NODE_ENV: "development",
        },
    });

    const page = await app.firstWindow();

    try {
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 });
        await page.waitForTimeout(2500);

        // --- Step 1: Model picker and download dialog ---
        let modelPickerOpened = false;
        let downloadDialogOpened = false;
        let qwen3Visible = false;

        const modelButton = page
            .locator("button")
            .filter({ hasText: /Select Model|Download Models/i })
            .first();

        if (await modelButton.isVisible().catch(() => false)) {
            await modelButton.click();
            modelPickerOpened = true;

            const browseItem = page.locator("text=Browse & Download Models").first();
            if (await browseItem.isVisible().catch(() => false)) {
                await browseItem.click();

                const dialogTitle = page.locator("text=Download Models").first();
                if (await dialogTitle.isVisible().catch(() => false)) {
                    downloadDialogOpened = true;

                    const search = page.locator('input[placeholder*="Search models"]').first();
                    if (await search.isVisible().catch(() => false)) {
                        await search.fill("Qwen3 Coder Next");
                        await page.waitForTimeout(500);
                    }

                    qwen3Visible = await page
                        .locator("text=Qwen3 Coder Next 80B")
                        .first()
                        .isVisible()
                        .catch(() => false);
                }
            }
        }

        printResult(
            "Model picker",
            modelPickerOpened,
            modelPickerOpened ? "opened" : "not found"
        );
        printResult(
            "Download dialog",
            downloadDialogOpened,
            downloadDialogOpened ? "opened from picker" : "not opened"
        );
        printResult(
            "Qwen3 entry",
            qwen3Visible,
            qwen3Visible ? "visible in catalog" : "not visible"
        );

        // --- Step 2: Download API start/cancel smoke ---
        const downloadSmoke = await page.evaluate(async () => {
            const response = {
                startSuccess: false,
                startError: null,
                cancelSuccess: false,
                activeBeforeCancel: [],
                activeAfterCancel: [],
            };

            try {
                const startPromise = window.electronAPI.modelDownload.download("llama-1b");
                await new Promise((resolve) => setTimeout(resolve, 1500));

                response.activeBeforeCancel =
                    await window.electronAPI.modelDownload.getActiveDownloads();

                const cancelResult =
                    await window.electronAPI.modelDownload.cancel("llama-1b");
                response.cancelSuccess = cancelResult.success;

                response.activeAfterCancel =
                    await window.electronAPI.modelDownload.getActiveDownloads();

                const startResult = await startPromise;
                response.startSuccess = startResult.success;
                if (!startResult.success) {
                    response.startError = startResult.error || "unknown";
                }
            } catch (error) {
                response.startError =
                    error instanceof Error ? error.message : String(error);
            }

            return response;
        });

        const downloadPathOk =
            downloadSmoke.startSuccess ||
            downloadSmoke.cancelSuccess ||
            downloadSmoke.activeBeforeCancel.includes("llama-1b");

        printResult(
            "Download start/cancel smoke",
            downloadPathOk,
            JSON.stringify(downloadSmoke)
        );

        // --- Step 3: MCP full API flow ---
        const desktopPath = path.join(process.env.USERPROFILE || "C:\\Users\\Public", "Desktop");

        const mcpFlow = await page.evaluate(async (desktop) => {
            const out = {
                initialize: null,
                ready: null,
                tools: null,
                listDirectory: null,
            };

            out.initialize = await window.electronAPI.mcp.initialize();
            out.ready = await window.electronAPI.mcp.isReady();
            out.tools = await window.electronAPI.mcp.listTools("filesystem");
            out.listDirectory = await window.electronAPI.mcp.callTool({
                serverName: "filesystem",
                tool: "list_directory",
                arguments: { path: desktop },
            });

            return out;
        }, desktopPath);

        const mcpOk =
            mcpFlow.initialize?.success === true &&
            mcpFlow.ready?.success === true &&
            mcpFlow.ready?.ready === true &&
            mcpFlow.tools?.success === true &&
            mcpFlow.listDirectory?.success === true;

        printResult("MCP initialize/list/call", mcpOk, JSON.stringify(mcpFlow));

        const overall =
            modelPickerOpened &&
            downloadDialogOpened &&
            qwen3Visible &&
            downloadPathOk &&
            mcpOk;

        console.log("\n" + "=".repeat(64));
        if (overall) {
            console.log("🎉 OVERALL: PASS");
        } else {
            console.log("⚠️ OVERALL: PARTIAL (see failed steps above)");
        }
        console.log("=".repeat(64));
    } finally {
        await app.close();
    }
}

run().catch((error) => {
    console.error("❌ Fatal test error:", error);
    process.exit(1);
});
