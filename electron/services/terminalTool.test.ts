// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  clampTimeout,
  DEFAULT_TIMEOUT_SECONDS,
  failureLines,
  formatRun,
  MAX_TIMEOUT_SECONDS,
  OutputCollector,
  runCommand,
  runCommandTool,
  shellInvocation,
  stopRunningCommands,
  windowsPowerShellNote,
} from "./terminalTool";

const text = (result: Awaited<ReturnType<typeof runCommand>>) =>
  result.success
    ? (result.data as { content: { text: string }[] }).content[0]!.text
    : (result.error ?? "");

describe("OutputCollector", () => {
  it("keeps the start and the end, and says how much was cut", () => {
    const output = new OutputCollector(5, 10);
    output.push("abcdefgh");
    output.push("ijklmnopqrstuvwxyz");
    expect(output.toString()).toBe(
      "abcde\n[... 11 characters cut ...]\nqrstuvwxyz"
    );
  });

  it("keeps everything that fits", () => {
    const output = new OutputCollector(5, 10);
    output.push("short");
    output.push(" line\n");
    expect(output.toString()).toBe("short line");
  });

  it("drops colour codes and keeps the last state of a redrawn line", () => {
    const output = new OutputCollector();
    output.push("\u001b[32mPASS\u001b[0m app.test.js\r\n");
    output.push("progress 10%\rprogress 100%\n");
    expect(output.toString()).toBe("PASS app.test.js\nprogress 100%");
  });
});

describe("clampTimeout", () => {
  it("defaults, rounds and caps", () => {
    expect(clampTimeout(undefined)).toBe(DEFAULT_TIMEOUT_SECONDS);
    expect(clampTimeout(-5)).toBe(DEFAULT_TIMEOUT_SECONDS);
    expect(clampTimeout("30")).toBe(DEFAULT_TIMEOUT_SECONDS);
    expect(clampTimeout(0.2)).toBe(1);
    expect(clampTimeout(45.4)).toBe(45);
    expect(clampTimeout(99999)).toBe(MAX_TIMEOUT_SECONDS);
  });
});

describe("shellInvocation", () => {
  it("passes the command to PowerShell encoded, so no quoting can break it", () => {
    const command = `Select-String -Pattern "a|b" -Path 'x y.ps1'`;
    const { file, args } = shellInvocation(command, "win32", "pwsh.exe");
    expect(file).toBe("pwsh.exe");
    expect(args).toContain("-NonInteractive");
    const script = Buffer.from(args.at(-1)!, "base64").toString("utf16le");
    expect(script).toContain(`\n${command}\n`);
    expect(script).toContain("exit $LASTEXITCODE");
  });

  it("uses sh elsewhere", () => {
    expect(shellInvocation("ls", "linux", "pwsh.exe")).toEqual({
      file: "/bin/sh",
      args: ["-c", "ls"],
    });
  });
});

describe("formatRun", () => {
  it("leads with the exit code and time", () => {
    expect(formatRun(0, 2430, "ok")).toBe("Exit code 0 · 2.4 s\nok");
    expect(formatRun(1, 100, "")).toBe("Exit code 1 · 0.1 s\n(no output)");
  });

  // Qwen3-Coder's integration test, 2026-09-28: exit code 0, and the model
  // answered "All Tests Passed Successfully"
  const integrationTest = [
    "=== Integration Test ===",
    "✗ Failed to load set-radio.ps1:  A parameter cannot be found that matches parameter name 'Object'.",
    "ERR: The remote server returned an error: (404) Not Found.",
    "BR \\docs => OK len=7656",
    "✓ diag.ps1 loaded successfully",
    "✓ diag.ps1 uses proper error handling",
    "=== Integration Test Complete ===",
  ].join("\n");

  it("lists failure-looking lines after a run that exited 0", () => {
    const run = formatRun(0, 2200, integrationTest);
    expect(run).toContain(
      "[Exit code 0, but 2 lines of the output look like failures."
    );
    expect(run).toContain("do not report success over them");
    expect(run).toContain("\n- ✗ Failed to load set-radio.ps1:");
    expect(run).toContain("\n- ERR: The remote server returned an error");
  });

  it("adds nothing when the exit code already says it failed", () => {
    expect(formatRun(1, 100, integrationTest)).not.toContain("look like");
  });

  it("adds nothing to a clean run", () => {
    const clean = "✓ 12 tests passed\nTests: 12 passed, 0 failed\nDone";
    expect(formatRun(0, 100, clean)).toBe(`Exit code 0 · 0.1 s\n${clean}`);
  });
});

describe("failureLines", () => {
  it.each([
    "FAIL  src/app.test.ts > adds",
    "Tests: 3 failed, 9 passed",
    "TypeError: x is not a function",
    "error TS2322: Type 'string' is not assignable",
    "Get-Content: Cannot find path 'x.txt' because it does not exist.",
    "foo: The term 'foo' is not recognized as a name of a cmdlet",
    "Traceback (most recent call last):",
    "npm ERR! code ELIFECYCLE",
    "× adds numbers",
  ])("flags %s", (line) => {
    expect(failureLines(line)).toEqual([line]);
  });

  it.each([
    "✓ handles errors",
    "PASS src/app.test.ts",
    "0 errors, 0 warnings",
    "Error handling improved",
  ])("leaves %s", (line) => {
    expect(failureLines(line)).toEqual([]);
  });
});

describe("windowsPowerShellNote", () => {
  const pwsh = "C:\\Program Files\\PowerShell\\7\\pwsh.exe";

  it("corrects a command that started Windows PowerShell 5.1", () => {
    for (const command of [
      "powershell -ExecutionPolicy Bypass -File test-scripts.ps1",
      "powershell.exe -File x.ps1",
      "cd src; powershell -File x.ps1",
    ]) {
      const note = windowsPowerShellNote(command, pwsh);
      expect(note).toContain("Windows PowerShell 5.1");
      expect(note).toContain(".\\name.ps1 or pwsh -File");
    }
  });

  it("says nothing otherwise", () => {
    expect(windowsPowerShellNote("pwsh -File x.ps1", pwsh)).toBe("");
    expect(windowsPowerShellNote(".\\x.ps1", pwsh)).toBe("");
    expect(windowsPowerShellNote("Get-Help about_powershell", pwsh)).toBe("");
    // No PowerShell 7: 5.1 is all there is
    expect(
      windowsPowerShellNote("powershell -File x.ps1", "powershell.exe")
    ).toBe("");
  });
});

describe("runCommandTool", () => {
  it("asks for a reason the user sees", () => {
    const tool = runCommandTool("C:\\Program Files\\PowerShell\\7\\pwsh.exe");
    expect(tool.inputSchema.required).toEqual(["command", "reason"]);
    expect(tool.inputSchema.properties.reason.description).toContain(
      "what any script it runs does"
    );
  });

  it.runIf(process.platform === "win32")(
    "says how to run a script with PowerShell 7, and Codex's Windows rules",
    () => {
      const tool = runCommandTool("C:\\Program Files\\PowerShell\\7\\pwsh.exe");
      expect(tool.description).toContain("PowerShell 7");
      expect(tool.description).toContain(".\\name.ps1");
      expect(tool.description).toContain("never powershell.exe");
      expect(tool.description).toContain("-LiteralPath");
      expect(runCommandTool("powershell.exe").description).toContain(
        "plain ASCII"
      );
    }
  );
});

describe("runCommand", () => {
  it("needs a command and a project folder", async () => {
    expect(text(await runCommand({}, "C:/p"))).toContain('needs a "command"');
    const noFolder = await runCommand({ command: "git status" }, null);
    expect(noFolder.success).toBe(false);
    expect(text(noFolder)).toContain("No project folder");
  });
});

// Real PowerShell runs: slow-ish (a second or so to start each), Windows only
describe.runIf(process.platform === "win32")("runCommand on Windows", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "shield-run-"));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("runs in the project folder and returns the output", async () => {
    const result = await runCommand(
      { command: "(Get-Location).Path; Write-Output 'héllo ✓'" },
      dir
    );
    expect(result.success).toBe(true);
    const out = text(result);
    expect(out).toMatch(/^Exit code 0 · /);
    expect(out.toLowerCase()).toContain(path.basename(dir).toLowerCase());
    expect(out).toContain("héllo ✓");
  }, 30_000);

  it("reports a program's own exit code", async () => {
    const result = await runCommand({ command: "cmd /c exit 5" }, dir);
    expect(text(result)).toMatch(/^Exit code 5 · /);
  }, 30_000);

  it("reports a failed PowerShell command as exit code 1, with the error", async () => {
    const result = await runCommand(
      { command: "Get-Content no-such-file.txt" },
      dir
    );
    expect(result.success).toBe(true);
    expect(text(result)).toMatch(/^Exit code 1 · /);
    expect(text(result)).toMatch(/no-such-file\.txt/);
  }, 30_000);

  it("fails at once instead of waiting for input", async () => {
    const started = Date.now();
    const result = await runCommand({ command: "Read-Host 'Name'" }, dir);
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(text(result)).not.toMatch(/^Exit code 0 /);
  }, 30_000);

  it("stops a command at its timeout", async () => {
    const result = await runCommand(
      { command: "Start-Sleep -Seconds 30", timeout_seconds: 2 },
      dir
    );
    expect(result.success).toBe(false);
    expect(text(result)).toContain("Stopped after 2 s");
  }, 30_000);

  it("stops a command when the user presses Stop", async () => {
    const running = runCommand(
      { command: "Write-Output started; Start-Sleep -Seconds 30" },
      dir
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(stopRunningCommands()).toBe(1);
    const result = await running;
    expect(result.success).toBe(false);
    expect(text(result)).toContain("Stopped by the user");
  }, 30_000);
});
