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
    pattern:
      /(^|[\s;&|(])(sudo|su|doas|pkexec|runas)(\s|$)|\bchmod\s+(-R\s+)?[0-7]*7[0-7]{0,2}7\b|\bchown\b|Set-ExecutionPolicy|Start-Process\b[^;]*-Verb\s+RunAs/i,
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

/** Words of a command, quotes stripped; good enough to spot paths */
function words(command: string): string[] {
  return command
    .split(/[\s|;&<>()]+/)
    .map((word) => word.replace(/^["']+|["']+$/g, ""))
    .filter(Boolean);
}

/** The paths a call names that lie outside `folder`, at most three */
function outsidePaths(
  args: Record<string, unknown>,
  folder?: string
): string[] {
  const posix = !folder || folder.startsWith("/");
  const found: string[] = [];
  const candidates =
    typeof args.command === "string"
      ? words(args.command)
      : ["path", "source", "destination"]
          .map((key) => args[key])
          .filter((value): value is string => typeof value === "string");
  for (const word of candidates) {
    // A relative file argument stays in the project; only commands are
    // read word by word for rooted paths and climbs
    if (typeof args.command !== "string" && !/^([/~\\]|[A-Za-z]:|\.\.)/.test(word))
      continue;
    // flags such as -name or a glob pattern are no path
    if (word.startsWith("-") && !word.includes("=")) continue;
    // Output thrown away or sent to the terminal reaches nothing
    if (/^\/dev\/(null|stdout|stderr|tty)$/.test(word)) continue;
    if (leavesFolder(word, folder, posix) && !found.includes(word)) {
      found.push(word.replace(/^-[^=]*=/, ""));
    }
  }
  return found.slice(0, 3);
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
  const outside = outsidePaths(args, folder);
  if (outside.length > 0) {
    warnings.push({
      level: "outside",
      text: `Reaches outside the project folder: ${outside.join(", ")}`,
    });
  }
  return warnings;
}
