/**
 * AgentsMd Hint
 *
 * A code session's project without an AGENTS.md gets a one-line offer to
 * draft one. Offered, never written unasked: it would land in the user's
 * repository, and a small model's wrong guesses there would be read as
 * instructions in every later session. The draft is written from facts
 * SHIELD gathers itself, and the user reads it before it is saved.
 */

import { FileText } from "lucide-react";
import { useState } from "react";

const DISMISSED_KEY = "shield.agentsMdDismissed";

/** Folders the user said "Not now" for; a convenience, so it may be lost */
function dismissedFolders(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

/** One folder however it is written: separators, a trailing one, case */
const key = (folder: string) =>
  folder
    .replace(/[\\/]+/g, "/")
    .replace(/\/$/, "")
    .toLowerCase();

interface AgentsMdHintProps {
  folder: string;
  onDraft: () => void;
}

export function AgentsMdHint({ folder, onDraft }: AgentsMdHintProps) {
  const [dismissed, setDismissed] = useState(() =>
    dismissedFolders().includes(key(folder))
  );
  if (dismissed) return null;

  const notNow = () => {
    setDismissed(true);
    try {
      const folders = new Set(dismissedFolders());
      folders.add(key(folder));
      localStorage.setItem(DISMISSED_KEY, JSON.stringify([...folders]));
    } catch {
      // Blocked storage: the offer comes back next time
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 text-xs text-muted-foreground">
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        No AGENTS.md in this project - the instructions coding agents read.
      </span>
      <button
        onClick={onDraft}
        className="shrink-0 rounded px-1.5 py-0.5 text-foreground underline-offset-2 hover:underline"
      >
        Draft one
      </button>
      <button
        onClick={notNow}
        className="shrink-0 rounded px-1.5 py-0.5 underline-offset-2 hover:underline"
      >
        Not now
      </button>
    </div>
  );
}
