/**
 * The computer SHIELD runs on: the renderer reads `navigator`, the main
 * process (no `navigator`) reads `process.platform`. Used to word prompts and
 * messages and to pick the shell rules for run_command. Unknown means
 * Windows, the platform SHIELD was built for.
 */

export type HostOs = "windows" | "linux" | "mac";

/** Node's `process.platform` as a HostOs: "win32" is Windows, "darwin" macOS, the rest Linux */
export function osFromNodePlatform(platform: string): HostOs {
  return platform === "win32"
    ? "windows"
    : platform === "darwin"
      ? "mac"
      : "linux";
}

export function hostOs(
  nav:
    { platform?: string; userAgent?: string } | undefined = typeof navigator ===
  "undefined"
    ? undefined
    : navigator
): HostOs {
  if (!nav && typeof process !== "undefined" && process.platform) {
    return osFromNodePlatform(process.platform);
  }
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

/** What the desktop calls the place deleted files go: "Recycle Bin" or "Trash" */
export function trashName(os: HostOs = hostOs()): string {
  return os === "windows" ? "Recycle Bin" : "Trash";
}
