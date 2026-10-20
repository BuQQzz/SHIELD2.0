/**
 * The computer SHIELD runs on, as the renderer can tell (it has no
 * `process`). Used to word prompts and to pick the shell rules for
 * run_command. Unknown means Windows, the platform SHIELD was built for.
 */

export type HostOs = "windows" | "linux" | "mac";

export function hostOs(
  nav:
    { platform?: string; userAgent?: string } | undefined = typeof navigator ===
  "undefined"
    ? undefined
    : navigator
): HostOs {
  const text = `${nav?.platform ?? ""} ${nav?.userAgent ?? ""}`;
  if (/mac|darwin/i.test(text)) return "mac";
  if (/linux|x11|bsd/i.test(text)) return "linux";
  return "windows";
}

/** "Windows", "Linux" or "macOS", for prompts */
export function osName(os: HostOs = hostOs()): string {
  return os === "windows" ? "Windows" : os === "mac" ? "macOS" : "Linux";
}

/** A sample absolute path in the host's style, for prompt examples */
export function samplePath(os: HostOs = hostOs()): string {
  return os === "windows"
    ? "C:\\\\Users\\\\Name\\\\Desktop\\\\file.txt"
    : "/home/name/Desktop/file.txt";
}
