/**
 * Which terminal commands may run without asking
 *
 * run_command (electron/services/terminalTool.ts) runs a command unprompted
 * in Auto, Plan and Read-only only when it can only look: git status, diff
 * and log, listing, reading and searching files. Every other command asks
 * in Auto and shows the exact command, as deletes do (decided with the
 * user, 2026-09-26).
 *
 * The check errs towards asking. A command it cannot fully read - a second
 * command, a redirect, a variable, an expression, a path outside the
 * project folder - asks, however harmless it looks. Adding a command here
 * means it can run with nobody watching, so it must not be able to change
 * anything or read outside the project folder.
 */

import { hostOs, type HostOs } from "../utils/platform";

export const TERMINAL_SERVER_NAME = "terminal";
export const RUN_COMMAND_TOOL_NAME = "run_command";

/**
 * Anything that could start a second command, redirect output, expand a
 * variable or evaluate an expression - or, with ":", name a drive, a
 * PowerShell provider (Env:, HKLM:) or a URL.
 */
const UNSAFE = /[;&<>`$(){}[\]@:]|\|\|/;

/**
 * On Linux and macOS commands run in sh, where a backslash can escape a quote
 * and hide a pipe from the word splitter below (`echo \" | rm x \"` is two
 * commands to sh and one quoted string to the splitter), and "!" is history
 * and negation. A backslash in a path is a Windows habit, so refusing it
 * costs nothing.
 */
const POSIX_UNSAFE = /[;&<>`$(){}[\]@:\\!]|\|\|/;

/** Line breaks (including Unicode ones), tabs and other control characters */
function hasControlCharacter(text: string): boolean {
  return [...text].some((char) => {
    const code = char.charCodeAt(0);
    return (
      code < 0x20 ||
      code === 0x7f ||
      code === 0x85 ||
      code === 0x2028 ||
      code === 0x2029
    );
  });
}

/** PowerShell commands and aliases that only read or reshape output */
const READ_ONLY_COMMANDS = new Set([
  "get-childitem",
  "gci",
  "ls",
  "dir",
  "get-content",
  "gc",
  "cat",
  "type",
  "select-string",
  "sls",
  "get-item",
  "gi",
  "test-path",
  "resolve-path",
  "get-location",
  "gl",
  "pwd",
  "get-filehash",
  "split-path",
  "join-path",
  "get-command",
  "gcm",
  "get-date",
  "measure-object",
  "measure",
  "select-object",
  "select",
  "sort-object",
  "sort",
  "where-object",
  "where",
  "group-object",
  "group",
  "get-unique",
  "format-table",
  "ft",
  "format-list",
  "fl",
  "format-wide",
  "fw",
  "out-string",
  "write-output",
  "echo",
]);

/** git subcommands that only read, with any arguments except those below */
const GIT_READS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "blame",
  "ls-files",
  "rev-parse",
  "grep",
  "shortlog",
  "describe",
]);

/**
 * Options that write a file or start another program: --output writes the
 * diff to a file; grep's -O opens the matches in a pager program.
 */
const GIT_UNSAFE_OPTION = /^(--output|--ext-diff|--open-files-in-pager|-O)/;

/** `git branch` only lists with these; any other argument creates or deletes */
const GIT_BRANCH_LIST_FLAGS = new Set([
  "-a",
  "--all",
  "-r",
  "--remotes",
  "-v",
  "-vv",
  "--verbose",
  "--show-current",
]);

/**
 * The command split into pipeline stages of words, quotes removed; null
 * when a quote is left open.
 */
function stages(command: string): string[][] | null {
  const result: string[][] = [[]];
  let word = "";
  let inWord = false;
  let quote: string | null = null;
  const endWord = () => {
    if (inWord) result[result.length - 1]!.push(word);
    word = "";
    inWord = false;
  };
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      inWord = true;
    } else if (char === "|") {
      endWord();
      result.push([]);
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      word += char;
      inWord = true;
    }
  }
  if (quote) return null;
  endWord();
  return result;
}

/**
 * A path that could leave the project folder: rooted ("\x", "/x"), in the
 * home folder ("~"), or climbing out ("..\x").
 */
function leavesFolder(word: string): boolean {
  return (
    /^[\\/~]/.test(word) ||
    // an option with its path attached: --file=/etc/passwd
    /=[\\/~]/.test(word) ||
    /(^|[\\/])\.\.([\\/]|$)/.test(word)
  );
}

function isReadOnlyGit(words: string[]): boolean {
  let rest = words.slice(1);
  if (rest[0] === "--no-pager") rest = rest.slice(1);
  // Global options (-C, -c, --git-dir...) come before the subcommand
  const [sub, ...args] = rest;
  if (!sub) return false;
  if (sub === "--version") return args.length === 0;
  if (args.some((arg) => GIT_UNSAFE_OPTION.test(arg))) return false;
  if (GIT_READS.has(sub)) return true;
  if (sub === "branch") {
    const listing = args.includes("--list") || args.includes("-l");
    return args.every(
      (arg) =>
        GIT_BRANCH_LIST_FLAGS.has(arg) ||
        arg === "--list" ||
        arg === "-l" ||
        (listing && !arg.startsWith("-"))
    );
  }
  if (sub === "remote")
    return args.every((arg) => /^(-v|--verbose)$/.test(arg));
  if (sub === "stash") return args[0] === "list";
  return false;
}

function isReadOnlyStage(words: string[]): boolean {
  const [name, ...args] = words;
  if (!name) return false;
  const command = name.toLowerCase();
  if (words.some(leavesFolder)) return false;
  if (command === "git") return isReadOnlyGit(words);
  if (command === "npm")
    return args.length === 1 && /^(ls|list)$/.test(args[0]!);
  if (READ_ONLY_COMMANDS.has(command)) return true;
  // "node --version": a program on the PATH asked only for its version
  return (
    /^[a-z][\w.-]*$/i.test(name) && args.length === 1 && args[0] === "--version"
  );
}

/**
 * Commands that only read when run in sh, with the options that make them
 * write or wait checked in `isReadOnlyPosixStage`. Not `find` (-delete,
 * -exec), `tree` (-o), `date` (-s), `rg` (--pre) or `xargs`.
 */
const POSIX_READ_ONLY = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "pwd",
  "echo",
  "stat",
  "which",
  "sort",
  "uniq",
  "cut",
  "diff",
  "basename",
  "dirname",
  "realpath",
]);

function isReadOnlyPosixStage(words: string[]): boolean {
  const [name, ...args] = words;
  if (!name) return false;
  if (words.some(leavesFolder)) return false;
  if (name === "git") return isReadOnlyGit(words);
  if (name === "npm") return args.length === 1 && /^(ls|list)$/.test(args[0]!);
  if (POSIX_READ_ONLY.has(name)) {
    // sort -o FILE and --output write a file; --compress-program runs one
    if (name === "sort") {
      return !args.some(
        (a) => /^-[^-]*o/.test(a) || /^--(output|compress)/.test(a)
      );
    }
    // tail -f never ends; it would only be stopped by the timeout
    if (name === "tail") {
      return !args.some(
        (a) => /^-[^-]*[fF]/.test(a) || /^--(follow|retry)/.test(a)
      );
    }
    // uniq INPUT OUTPUT writes OUTPUT
    if (name === "uniq") {
      return args.filter((a) => !a.startsWith("-")).length <= 1;
    }
    return true;
  }
  return (
    /^[a-z][\w.-]*$/i.test(name) && args.length === 1 && args[0] === "--version"
  );
}

const SCRIPT_FILE = /\.(ps1|psm1|bat|cmd|py|js|mjs|cjs|ts|sh|rb|pl)$/i;

/**
 * Script files a command names, as written ("test-scripts.ps1",
 * ".\run.ps1"). The permission bar shows the ones the model wrote itself:
 * approving `powershell -File integration-test.ps1` approved a script
 * Qwen3-Coder had written seconds before, which ran set-radio.ps1 - a
 * script that switches the Wi-Fi radio (2026-09-28).
 */
export function scriptsInCommand(command: string): string[] {
  const words = command
    .split(/\s+/)
    .map((word) => word.replace(/^["'&(]+/, "").replace(/["');|]+$/, ""))
    .filter(
      (word) =>
        !word.startsWith("-") && !/[*?]/.test(word) && SCRIPT_FILE.test(word)
    );
  return [...new Set(words)];
}

/**
 * True when the command can only read inside the project folder. `os`
 * selects the shell's rules: PowerShell on Windows, sh elsewhere.
 */
export function isReadOnlyCommand(
  command: string,
  os: HostOs = hostOs()
): boolean {
  const posix = os !== "windows";
  const text = command.trim();
  if (!text || (posix ? POSIX_UNSAFE : UNSAFE).test(text)) return false;
  if (hasControlCharacter(text)) return false;
  const parsed = stages(text);
  return (
    parsed !== null &&
    parsed.every((words) =>
      posix ? isReadOnlyPosixStage(words) : isReadOnlyStage(words)
    )
  );
}
