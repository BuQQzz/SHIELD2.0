/**
 * Commands that delete
 *
 * The user's call (2026-11-24): in Ask and Auto, edits and commands run
 * without asking; only something being deleted asks, in every mode. This
 * finds the commands that delete files or throw work away: rm and its
 * kin, find -delete, git clean, git rm, git reset --hard, discarding
 * changes with git checkout/restore, dropping a branch or a stash, and a
 * script that removes files inline (python -c "os.remove(...)"). On
 * Windows, Remove-Item and its aliases.
 *
 * It errs towards asking: "rm" after a ; or && inside a quoted string asks
 * too. A script file that deletes when run cannot be seen from its command
 * line; that runs like any other script.
 */

import { hostOs, type HostOs } from "../utils/platform";

/** Where a command starts: line start, after ; & | ( or a backtick, or after a wrapper */
const AT = String.raw`(?:^|[;&|(\x60\n]\s*|\b(?:sudo|doas|xargs|exec|env|command|nohup|time|then|do)\s+(?:-\S+\s+)*)`;

const POSIX: RegExp[] = [
  new RegExp(`${AT}(?:\\S*/)?(?:rm|rmdir|unlink|shred|srm|trash|trash-put|gio\\s+(?:trash|remove))\\b`),
  /\bfind\b[^;&|\n]*\s-delete\b/,
  /-exec(?:dir)?\s+(?:\S*\/)?rm\b/,
];

const WINDOWS: RegExp[] = [
  new RegExp(
    `${AT}(?:Remove-Item|ri|rm|del|erase|rd|rmdir|Clear-RecycleBin)\\b`,
    "i"
  ),
  /\[System\.IO\.(?:File|Directory)\]::Delete\b/i,
];

const EVERYWHERE: RegExp[] = [
  /\bgit\s+(?:-C\s+\S+\s+)?(?:clean|rm)\b/,
  /\bgit\s+(?:-C\s+\S+\s+)?reset\b[^;&|\n]*--hard\b/,
  /\bgit\s+(?:-C\s+\S+\s+)?(?:checkout|restore)\b[^;&|\n]*(?:\s--\s|\s\.(?:\s|$))/,
  /\bgit\s+(?:-C\s+\S+\s+)?branch\s+(?:-D|--delete\s+--force)\b/,
  /\bgit\s+(?:-C\s+\S+\s+)?stash\s+(?:drop|clear)\b/,
  // Inline scripts: python -c, node -e
  /\b(?:os\.(?:remove|unlink|rmdir|removedirs)|shutil\.rmtree|\.unlink\(|\.rmdir\(|(?:rmSync|unlinkSync|rmdirSync)\b|fs\.(?:rm|unlink|rmdir)\b|rimraf)/,
];

export function isDeletingCommand(
  command: string,
  os: HostOs = hostOs()
): boolean {
  const text = command.trim();
  if (!text) return false;
  const rules = [...EVERYWHERE, ...(os === "windows" ? WINDOWS : POSIX)];
  return rules.some((rule) => rule.test(text));
}
