/**
 * SHIELD's own warnings on a permission prompt
 *
 * The permission bar showed the command and the reason the model gave for
 * it, nothing of SHIELD's. In a growing-project test the model searched
 * the whole home folder, read another project's data and created
 * ~/.spend - 11 prompts that looked like any other (2026-11-09). Each
 * prompt now says, in SHIELD's words, when a call reaches outside the
 * project folder, and says plainly when it does something a project task
 * rarely needs: touch keys or passwords, send data out, run code fetched
 * on the fly, take admin rights, delete outside the project, or set
 * something to run later.
 *
 * These are reading aids for the user, not a filter: a command they do
 * not flag can still be harmful, and one they flag can be fine.
 */

import { leavesFolder } from "./commandSafety";

export interface PromptWarning {
  /** "danger": rarely part of a project task; "outside": leaves the folder */
  level: "danger" | "outside";
  text: string;
  /**
   * For "Deletes folders": each folder as the command names it, and its
   * path after any `cd` (relative to the project when there is none), so
   * the caller can leave out folders that do not exist
   */
  folders?: { shown: string; path: string }[];
}

const DANGERS: Array<{ pattern: RegExp; text: string }> = [
  {
    pattern:
      /(\.ssh\b|id_(rsa|ed25519|ecdsa)|\.gnupg|\.aws\/credentials|\.netrc|\/etc\/(shadow|sudoers)|\.password-store|keyring|Login Data|\.mozilla\/firefox|\.config\/(google-chrome|chromium|BraveSoftware)|wallet\.dat)/i,
    text: "Touches keys, passwords or browser data",
  },
  {
    pattern:
      /\b(curl|wget)\b[^|;&]*\s(-d|--data\S*|-F|--form|-T|--upload-file|-X\s*(POST|PUT)|--post-\w+)\b|\b(nc|ncat|netcat|socat|scp|sftp|ftp|telnet)\s|\brsync\b[^|;&]*\s\S+:|\bssh\s+\S/i,
    text: "Sends data over the network",
  },
  {
    pattern:
      /\b(curl|wget|base64\s+(-d|--decode))\b[^;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b|\b(curl|wget|base64\s+(-d|--decode))\b[^;&]*\|\s*(python3?|perl|ruby|node)\b|\beval\s/i,
    text: "Runs code it fetches or decodes on the fly",
  },
  {
    // Only where it runs: `which apt-get sudo` only looks it up (g22 step 11)
    pattern:
      /(^|[\n;&|(`]|\$\(|\b(?:xargs|env|nohup|exec|time|command)\s+)\s*(sudo|su|doas|pkexec|runas)(\s|$)|\bchmod\s+(-R\s+)?[0-7]*7[0-7]{0,2}7\b|\bchown\b|Set-ExecutionPolicy|Start-Process\b[^;]*-Verb\s+RunAs/i,
    text: "Takes admin rights or changes who can use files",
  },
  {
    pattern:
      /\b(dd\s+[^;&|]*of=|mkfs|shred|wipefs|fdisk|parted|format\s+[a-z]:)|\brm\s+(-\w*\s+)*(\/|~|\$HOME)(\s|\/?\*?\s*$|$)|Remove-Item\b[^;]*(-Recurse)[^;]*\s(\/|~|[A-Z]:\\)(\s|$)/i,
    text: "Can erase a disk or a whole folder tree",
  },
  {
    pattern:
      /\bcrontab\b|\bsystemctl\s+(--user\s+)?(enable|start)|\bat\s+now|\.(bashrc|bash_profile|zshrc|profile)\b|\.config\/autostart|LaunchAgents|schtasks|Register-ScheduledTask|CurrentVersion\\Run/i,
    text: "Sets something to run later on its own",
  },
  {
    pattern: /\b(pkill|killall|kill\s+-9|taskkill|Stop-Process)\b/i,
    text: "Stops other programs",
  },
];

/**
 * A command split into its commands (at unquoted ; | & ( ) < > and line
 * breaks) and each into words, quotes removed: enough to tell an argument
 * from a pattern, not a full shell parser
 */
function commandWords(command: string): string[][] {
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
    } else if (/[;|&()<>\n]/.test(char)) {
      endWord();
      result.push([]);
    } else if (/\s/.test(char)) {
      endWord();
    } else {
      word += char;
      inWord = true;
    }
  }
  endWord();
  return result.filter((words) => words.length > 0);
}

/** Commands whose first plain argument is a pattern or a program, not a file */
const PATTERN_FIRST = new Set([
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "awk",
  "gawk",
  "sed",
  "perl",
]);

/**
 * The words of a command that could be paths. A grep, awk or sed pattern is
 * left out: g6 and g7 showed `/^def` and `/def` (from `awk '/def
 * cmd_status/,...'`) as paths outside the project. Each word is cut at
 * quotes, commas and "=", so `P=/tmp/x` and the `open("/tmp/x","w")` of a
 * python -c script give /tmp/x (2026-11-09).
 */
function pathWords(command: string): string[] {
  const pieces: string[] = [];
  for (const words of commandWords(command)) {
    // VAR=value before the command sets a variable; its value can be a path
    while (words.length > 1 && /^[A-Za-z_]\w*=/.test(words[0]!)) {
      pieces.push(words.shift()!.replace(/^[A-Za-z_]\w*=/, ""));
    }
    const [name = "", ...args] = words;
    // echo and printf only print their words
    if (/^(echo|printf|Write-Output|Write-Host)$/i.test(name)) continue;
    let skipPattern = PATTERN_FIRST.has(name.replace(/^.*\//, ""));
    let skipNext = false;
    for (const arg of args) {
      if (skipNext) {
        skipNext = false;
        continue;
      }
      // grep -e PATTERN, sed -e SCRIPT, awk -f is a file and stays
      if (skipPattern && /^-(e|-regexp|-expression)$/.test(arg)) {
        skipNext = true;
        skipPattern = false;
        continue;
      }
      if (skipPattern && !arg.startsWith("-")) {
        skipPattern = false;
        continue;
      }
      pieces.push(...arg.split(/[\s"',=;()[\]{}]+/));
    }
  }
  // A regex, not a path: anchors, escapes, alternation
  // "~" names the home folder only alone or before "/"
  return pieces.filter(
    (piece) => piece && !/[\^$\\|]/.test(piece) && !/^~[^/]/.test(piece)
  );
}

/** The paths a call names that lie outside `folder`, at most three */
function outsidePaths(
  args: Record<string, unknown>,
  folder?: string
): string[] {
  const posix = !folder || folder.startsWith("/");
  const found: string[] = [];
  const isCommand = typeof args.command === "string";
  const candidates = isCommand
    ? pathWords(args.command as string)
    : ["path", "source", "destination"]
        .map((key) => args[key])
        .filter((value): value is string => typeof value === "string");
  for (const word of candidates) {
    // A relative file argument stays in the project; only commands are
    // read word by word for rooted paths and climbs
    if (!isCommand && !/^([/~\\]|[A-Za-z]:|\.\.)/.test(word)) continue;
    // flags such as -name are no path
    if (word.startsWith("-")) continue;
    // Output thrown away or sent to the terminal reaches nothing
    if (/^\/dev\/(null|stdout|stderr|tty)$/.test(word)) continue;
    // /tmp/x and /tmp/x/ are one folder
    const path = word.length > 1 ? word.replace(/\/+$/, "") : word;
    if (leavesFolder(path, folder, posix) && !found.includes(path)) {
      found.push(path);
    }
  }
  return found.slice(0, 3);
}

/** Folders a project can rebuild: deleting them loses nothing of the user's */
const REBUILDABLE =
  /^(__pycache__|node_modules|dist|build|out|target|coverage|\.pytest_cache|\.mypy_cache|\.ruff_cache|\.cache|\.next|\.turbo|\.venv|venv|env|htmlcov|\.tox|.*\.egg-info)$/;
/**
 * A name with a file extension (`spending.xlsx`), not a folder: `rm -rf`
 * on its own output files turned three of g14's test runs red at step 16,
 * and the test user's denials timed the step out (2026-11-10)
 */
const LOOKS_LIKE_FILE = /^[^.].*\.[A-Za-z0-9]{1,5}$/;
/**
 * A folder the model names as a test of its own (`testuser9`, `test-exp`,
 * `tmp_out`, `smc-test`); not `test` or `tests`, which hold a project's
 * tests
 */
const THROWAWAY_NAME =
  /^(?:(?!tests$)(test|tmp|temp|scratch)[-_]?[A-Za-z0-9][\w-]*|[\w-]+[-_](test|tmp)\d*)$/i;
/** Throwaway places: deleting a test folder there is the cleanup asked for */
const TEMP =
  /^(\/tmp|\/var\/tmp|\/private\/tmp|\$TMPDIR|\$\{TMPDIR\}|%TEMP%|\$env:TEMP)(\/|\\|$)/i;

/**
 * The folders a command deletes with everything in them, other than
 * throwaway and rebuildable ones. Seeding test data in g13 step 16, Bonsai
 * 2 ran `rm -rf .profiles test-exp` in the project: .profiles is where the
 * tracker keeps every person's data. Nothing real was in it yet, and the
 * prompt showed nothing but the command (2026-11-09).
 */
function recursiveDeletes(command: string): { shown: string; path: string }[] {
  const found: { shown: string; path: string }[] = [];
  // the folder a `cd` earlier in the command moved to
  let dir = "";
  const add = (target: string) => {
    const path = target.replace(/^["']|["']$/g, "").replace(/[/\\]+$/, "");
    // a file descriptor left by 2>&1, or a variable (mktemp -d) we cannot
    // see into; rm -rf $HOME is caught by DANGERS
    if (
      !path ||
      path.startsWith("-") ||
      /^\d+$/.test(path) ||
      /^\$\{?\w+\}?$/.test(path)
    )
      return;
    const full =
      /^([/~\\$%]|[A-Za-z]:)/.test(path) || !dir ? path : `${dir}/${path}`;
    if (TEMP.test(full)) return;
    const name = path.split(/[/\\]/).pop()!;
    if (
      REBUILDABLE.test(name) ||
      LOOKS_LIKE_FILE.test(name) ||
      THROWAWAY_NAME.test(name) ||
      found.some((f) => f.shown === path)
    ) {
      return;
    }
    found.push({ shown: path, path: full });
  };
  for (const words of commandWords(command)) {
    const [name = "", ...args] = words;
    if (/^(cd|Set-Location|pushd)$/i.test(name) && args.length === 1) {
      dir =
        /^([/~\\$%]|[A-Za-z]:)/.test(args[0]!) || !dir
          ? args[0]!
          : `${dir}/${args[0]}`;
      continue;
    }
    const flags = args.filter((a) => a.startsWith("-"));
    const recursive =
      (name === "rm" &&
        flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === "--recursive")) ||
      (/^(Remove-Item|ri|rd|rmdir)$/i.test(name) &&
        flags.some((f) => /^-r(ecurse)?$/i.test(f) || /^\/s$/i.test(f)));
    if (recursive)
      args.filter((a) => !a.startsWith("-") && !/^\/s$/i.test(a)).forEach(add);
    // find DIR ... -delete
    if (
      name === "find" &&
      args.includes("-delete") &&
      args[0] &&
      !args[0].startsWith("-")
    )
      add(args[0]);
  }
  for (const match of command.matchAll(
    /shutil\.rmtree\(\s*(?:r?["']([^"']+)["'])/g
  ))
    add(match[1]!);
  return found;
}

function deletesWarning(
  folders: { shown: string; path: string }[]
): PromptWarning {
  return {
    level: "danger",
    text: `Deletes folders and everything in them: ${folders
      .slice(0, 3)
      .map((f) => f.shown)
      .join(", ")}`,
    folders,
  };
}

/**
 * The warnings without folders that do not exist: a command that clears a
 * test folder before making it deletes nothing. g16 step 21 had three red
 * prompts for `rm -rf profiles/chk && mkdir -p profiles/chk`, a folder that
 * was not there; the test user denied them all (2026-11-10).
 */
export function withoutMissingFolders(
  warnings: PromptWarning[],
  missing: (path: string) => boolean
): PromptWarning[] {
  return warnings.flatMap((warning) => {
    if (!warning.folders) return [warning];
    const left = warning.folders.filter((f) => !missing(f.path));
    return left.length > 0 ? [deletesWarning(left)] : [];
  });
}

/** SHIELD's warnings for a call waiting on the user; empty when none apply */
export function promptWarnings(
  args: Record<string, unknown>,
  folder?: string
): PromptWarning[] {
  const warnings: PromptWarning[] = [];
  const command = typeof args.command === "string" ? args.command : "";
  if (command) {
    for (const danger of DANGERS) {
      if (danger.pattern.test(command)) {
        warnings.push({ level: "danger", text: danger.text });
      }
    }
  }
  const deleted = command ? recursiveDeletes(command) : [];
  if (deleted.length > 0) warnings.push(deletesWarning(deleted));
  const outside = outsidePaths(args, folder);
  if (outside.length > 0) {
    warnings.push({
      level: "outside",
      text: `Reaches outside the project folder: ${outside.join(", ")}`,
    });
  }
  return warnings;
}
