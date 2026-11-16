/**
 * An agent's work as the Team panel shows it: file names rather than full
 * paths, and commands without the wrapping a model adds to run them
 * ("cd /home/…/app && python3 -m unittest -v 2>&1; echo "EXIT_CODE=$?"").
 */

import { shortenPaths } from "@/agents/teamPlan";

/** A command as the user would type it in the project folder */
export function displayCommand(command: string): string {
  return shortenPaths(
    command
      .replace(/\s+/g, " ")
      .trim()
      // Into the project folder first: it already runs there
      .replace(/^(?:cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*(?:&&|;)\s*)+/, "")
      // Its exit code echoed: SHIELD reads the real one
      .replace(/\s*(?:;|&&)\s*echo\s+["']?EXIT_CODE=\$\??["']?\s*$/i, "")
      .replace(/\s*;\s*echo\s+["']?exit[^;]*\$\?["']?\s*$/i, "")
      // Errors folded into the output: the panel shows both anyway
      .replace(/\s+2>&1(?=\s|$)/g, "")
      // Output cut to its end or start for the model's sake
      .replace(/\s*\|\s*(?:tail|head)(?:\s+-n)?\s+-?\d+\s*$/, "")
      .trim()
  );
}

export { exitCodeIsItsOwn } from "@/agents/handoff";

/** The file's name, or its last two path segments when that says more */
export function displayPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join("/") : (parts[0] ?? path);
}

/** Text an agent wrote, with full paths cut to their last segments */
export const displayText = (text: string) => shortenPaths(text);
