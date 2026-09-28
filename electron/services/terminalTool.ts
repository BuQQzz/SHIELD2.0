/**
 * run_command: the model's terminal in Code sessions (main process only)
 *
 * Runs one command in the session's project folder - PowerShell on
 * Windows - and returns its output and exit code. Models could not test
 * what they wrote: Qwen's lint-scripts.ps1 crashed on the one path that
 * mattered (2026-09-26). And a filtered command (git diff, Select-String, a
 * test run) can replace reading whole files.
 *
 * Which commands run without asking is decided in the renderer, with every
 * other permission (src/config/commandSafety.ts); this file only runs them.
 * There is no input - stdin is closed, so a command that prompts fails
 * instead of waiting - and no background processes: a command must end on
 * its own within its timeout, and Stop ends it and everything it started.
 */

import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { StringDecoder } from "string_decoder";
import type { MCPToolResult } from "./MCPServerConfig.js";

export const TERMINAL_SERVER_NAME = "terminal";
export const RUN_COMMAND_TOOL_NAME = "run_command";

export const DEFAULT_TIMEOUT_SECONDS = 120;
export const MAX_TIMEOUT_SECONDS = 600;

/**
 * Output kept for the model: the start, and more of the end, where errors
 * and test summaries are. 8,000 characters fits the smallest result budget
 * (a third of an 8k window, messageHandler.ts).
 */
export const OUTPUT_HEAD_CHARS = 2000;
export const OUTPUT_TAIL_CHARS = 6000;

export function isTerminalTool(name: string): boolean {
  return name === RUN_COMMAND_TOOL_NAME;
}

/** PowerShell 7 when it is installed, else Windows PowerShell 5.1 */
export function findPowerShell(): string {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, "pwsh.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "powershell.exe";
}

/**
 * Which shell runs commands, and how to run a script in it. Qwen3-Coder ran
 * its own UTF-8 test script with `powershell -File` (2026-09-28): Windows
 * PowerShell 5.1 read the file as ANSI and every ✓ came out as "âœ“".
 */
function shellGuidance(powershell: string): string {
  if (process.platform !== "win32") return "with sh.";
  return /pwsh\.exe$/i.test(powershell)
    ? "with PowerShell 7. Run a PowerShell script as .\\name.ps1 or pwsh -File name.ps1 - never powershell.exe or powershell -File, which start the older Windows PowerShell 5.1 and misread UTF-8 files."
    : "with Windows PowerShell 5.1, which has no && or || (run one command per call) and reads a script as ANSI unless the file starts with a UTF-8 byte order mark: keep scripts to plain ASCII.";
}

/**
 * Adapted from the Windows rules Codex gives its shell tool
 * (openai/codex, codex-rs/core/src/tools/handlers/shell_spec.rs).
 */
const WINDOWS_RULES =
  " Windows rules: do not pass paths from one shell to another to delete or move them (such as listing in PowerShell and deleting with cmd /c) - use Remove-Item or Move-Item with -LiteralPath. Before any recursive delete or move, check that the full target path is inside the project folder.";

export function runCommandTool(powershell = findPowerShell()) {
  return {
    name: RUN_COMMAND_TOOL_NAME,
    description: `Run a command in the project folder and get its output and exit code. Commands run ${shellGuidance(powershell)} Use it to run the project's tests, a script you wrote or changed, a build or a linter, and to look around with git (git status, git diff, git log) or search the files (Select-String). Commands that only read, like those, run at once; any other command waits for the user to allow it, showing them your reason. The command must finish on its own: no servers, watch modes or prompts for input. Output is cut to its first ${OUTPUT_HEAD_CHARS.toLocaleString("en-US")} and last ${OUTPUT_TAIL_CHARS.toLocaleString("en-US")} characters.${process.platform === "win32" ? WINDOWS_RULES : ""}`,
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: 'The command to run, e.g. "npm test" or "git diff"',
        },
        reason: {
          type: "string",
          description:
            'One plain sentence for the user: what the command will do, including what any script it runs does, e.g. "Runs the unit tests" or "Runs integration-test.ps1, which loads set-radio.ps1 and switches the Wi-Fi radio on"',
        },
        timeout_seconds: {
          type: "number",
          description: `Stop the command after this many seconds (default ${DEFAULT_TIMEOUT_SECONDS}, at most ${MAX_TIMEOUT_SECONDS})`,
        },
      },
      required: ["command", "reason"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  };
}

/**
 * The program and arguments that run a command. On Windows the command goes
 * in -EncodedCommand, which no quoting can break, with UTF-8 output and the
 * command's own exit code (PowerShell otherwise reports only 0 or 1).
 */
export function shellInvocation(
  command: string,
  platform: NodeJS.Platform,
  powershell: string
): { file: string; args: string[] } {
  if (platform !== "win32") {
    return { file: "/bin/sh", args: ["-c", command] };
  }
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$OutputEncoding = [System.Text.Encoding]::UTF8",
    "$global:LASTEXITCODE = 0",
    command,
    "$shieldOk = $?",
    "if ($LASTEXITCODE) { exit $LASTEXITCODE }",
    "if (-not $shieldOk) { exit 1 }",
  ].join("\n");
  return {
    file: powershell,
    args: [
      "-NoProfile",
      "-NonInteractive",
      "-OutputFormat",
      "Text",
      "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64"),
    ],
  };
}

/**
 * Nothing waits for a person: no pagers, no credential prompts, test
 * runners in their run-once CI mode, no colour codes. core.fsmonitor=false
 * because a repository's own config could otherwise start a program on
 * `git status`.
 */
export function commandEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...base,
    CI: "1",
    GIT_PAGER: "cat",
    PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "false",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
  };
}

// eslint-disable-next-line no-control-regex -- colour codes start with ESC
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g;

/** Colour codes out; a line redrawn with \r (progress bars) keeps its last state */
function cleanOutput(text: string): string {
  return text
    .replace(ANSI, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.slice(line.lastIndexOf("\r") + 1))
    .join("\n");
}

/** Keeps the first and last characters of a stream of output */
export class OutputCollector {
  private head = "";
  private tail = "";
  private dropped = 0;

  constructor(
    private readonly headMax = OUTPUT_HEAD_CHARS,
    private readonly tailMax = OUTPUT_TAIL_CHARS
  ) {}

  push(text: string): void {
    if (this.head.length < this.headMax) {
      const room = this.headMax - this.head.length;
      this.head += text.slice(0, room);
      text = text.slice(room);
    }
    if (!text) return;
    this.tail += text;
    if (this.tail.length > this.tailMax) {
      this.dropped += this.tail.length - this.tailMax;
      this.tail = this.tail.slice(-this.tailMax);
    }
  }

  toString(): string {
    const cut =
      this.dropped > 0
        ? `\n[... ${this.dropped.toLocaleString("en-US")} characters cut ...]\n`
        : "";
    return (cleanOutput(this.head) + cut + cleanOutput(this.tail)).trimEnd();
  }
}

export function clampTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_TIMEOUT_SECONDS;
  }
  return Math.min(MAX_TIMEOUT_SECONDS, Math.max(1, Math.round(value)));
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * Lines that report something going wrong: a test's cross, a FAIL or ERROR
 * line, "3 failed", an exception or an "error:", PowerShell's "cannot be
 * found" and "is not recognized". Deliberately loose - one wrong flag costs
 * a sentence; a missed failure costs a false "all tests passed".
 */
const FAILURE_PATTERNS = [
  /^\s*(✗|✘|❌|×|✖)/,
  /^\s*(FAIL|FAILED|ERROR|ERR!?|FATAL)\b/,
  /\b[1-9]\d* (failed|failing|failures?|errors?)\b/i,
  /\b\w*(error|exception):/i,
  /\berror [A-Z]{1,4}\d{2,5}\b/,
  /^\s*Traceback \(most recent call last\)/,
  /\b(cannot|could not|can't) (be )?(find|found|load|open|access|resolve)\b/i,
  /\bis not recognized as\b/i,
  /\bnpm ERR!/,
];

/** A line that says it passed, even if it names an error ("✓ handles errors") */
const PASS_LINE = /^\s*(✓|✔|√|PASS\b|ok\b)/i;

export const MAX_FAILURE_LINES = 8;

/** Lines of the output that look like failures, first ones first */
export function failureLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !PASS_LINE.test(line) &&
        FAILURE_PATTERNS.some((pattern) => pattern.test(line))
    );
}

/**
 * "Exit code 1 · 2.4 s", then the output. An exit code of 0 says nothing
 * about output like "✗ Failed to load set-radio.ps1": a test script that
 * catches its own errors still exits 0, and Qwen3-Coder read exactly that
 * run as "All Tests Passed Successfully" (2026-09-28). So those lines are
 * listed after the output, where the model cannot miss them.
 */
export function formatRun(
  exitCode: number | null,
  elapsedMs: number,
  output: string
): string {
  const run = `Exit code ${exitCode ?? "unknown"} · ${seconds(elapsedMs)}\n${output || "(no output)"}`;
  const failures = exitCode === 0 ? failureLines(output) : [];
  if (failures.length === 0) return run;
  const shown = failures
    .slice(0, MAX_FAILURE_LINES)
    .map(
      (line) => `- ${line.length > 160 ? `${line.slice(0, 157)}...` : line}`
    );
  const more =
    failures.length > MAX_FAILURE_LINES
      ? `\n- and ${failures.length - MAX_FAILURE_LINES} more`
      : "";
  const count = `${failures.length} line${failures.length === 1 ? "" : "s"}`;
  return `${run}\n\n[Exit code 0, but ${count} of the output look${failures.length === 1 ? "s" : ""} like failures. Fix them, or tell the user about each one in your answer - do not report success over them:\n${shown.join("\n")}${more}]`;
}

/**
 * Said after a command that started Windows PowerShell 5.1 when PowerShell 7
 * is there. Told in the tool description to use pwsh, Qwen3-Coder still
 * copied `powershell -ExecutionPolicy Bypass -File ...` from its own
 * earlier calls (2026-09-28) - it follows its history more than the
 * description - so the correction comes with the result it just saw.
 */
export function windowsPowerShellNote(
  command: string,
  powershell: string
): string {
  if (!/pwsh\.exe$/i.test(powershell)) return "";
  if (!/(^|[\s;&|(])powershell(\.exe)?(\s|$)/i.test(command)) return "";
  return "\n\n[Note: powershell.exe is the old Windows PowerShell 5.1. It reads a UTF-8 script without a byte order mark as ANSI, so characters such as ✓ come out garbled (âœ“). PowerShell 7 runs your commands: run a script as .\\name.ps1 or pwsh -File name.ps1 instead.]";
}

const fail = (error: string): MCPToolResult => ({ success: false, error });

const running = new Set<ChildProcess>();
const stoppedByUser = new WeakSet<ChildProcess>();

/** Ends a command and every process it started */
function killTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    }).on("error", () => child.kill());
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

/** The user pressed Stop, or SHIELD is closing. Returns how many were running. */
export function stopRunningCommands(): number {
  const count = running.size;
  for (const child of running) {
    stoppedByUser.add(child);
    killTree(child);
  }
  return count;
}

/** Run a command. Never throws: failures come back as tool errors. */
export function runCommand(
  args: Record<string, unknown>,
  cwd: string | null
): Promise<MCPToolResult> {
  const command = typeof args.command === "string" ? args.command.trim() : "";
  if (!command) return Promise.resolve(fail('run_command needs a "command"'));
  if (!cwd) {
    return Promise.resolve(
      fail(
        "No project folder is open, so there is nowhere to run commands. Tell the user to choose a project folder for this session."
      )
    );
  }

  const timeout = clampTimeout(args.timeout_seconds);
  const powershell = findPowerShell();
  const { file, args: shellArgs } = shellInvocation(
    command,
    process.platform,
    powershell
  );
  const started = Date.now();

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(file, shellArgs, {
        cwd,
        env: commandEnv(process.env),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        // Its own process group, so the whole tree can be ended
        detached: process.platform !== "win32",
      });
    } catch (error) {
      resolve(
        fail(
          `Could not start the command: ${error instanceof Error ? error.message : String(error)}`
        )
      );
      return;
    }
    running.add(child);

    const output = new OutputCollector();
    for (const stream of [child.stdout, child.stderr]) {
      const decoder = new StringDecoder("utf8");
      stream?.on("data", (chunk: Buffer) => output.push(decoder.write(chunk)));
      stream?.on("end", () => output.push(decoder.end()));
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeout * 1000);

    let settled = false;
    const finish = (result: MCPToolResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(child);
      resolve(result);
    };

    child.on("error", (error) =>
      finish(fail(`Could not start the command: ${error.message}`))
    );
    child.on("close", (code) => {
      const elapsed = Date.now() - started;
      const text = output.toString();
      const soFar = text ? `\nOutput so far:\n${text}` : "";
      if (stoppedByUser.has(child)) {
        finish(fail(`Stopped by the user after ${seconds(elapsed)}.${soFar}`));
      } else if (timedOut) {
        finish(
          fail(
            `Stopped after ${timeout} s: the command did not finish. Commands must end on their own - servers, watch modes and prompts for input are not supported. For a long test run, pass a larger timeout_seconds (at most ${MAX_TIMEOUT_SECONDS}).${soFar}`
          )
        );
      } else {
        finish({
          success: true,
          data: {
            content: [
              {
                type: "text",
                text:
                  formatRun(code, elapsed, text) +
                  windowsPowerShellNote(command, powershell),
              },
            ],
          },
        });
      }
    });
  });
}
