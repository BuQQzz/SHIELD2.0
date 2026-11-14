/**
 * Where SHIELD's memory notes come from and how they are compared
 * (memoryNotes.ts says what a note is): facts from the model's summary
 * notes, what the user says about themselves, and whether a new note
 * repeats, updates or is unrelated to one SHIELD has. No model: rules
 * that are cheap enough to run on every message and summary.
 */

import {
  checkNoteText,
  noteAnchors,
  type MemoryNote,
  type NoteCandidate,
  type NoteKind,
} from "./memoryNotes.js";

/** Longest note SHIELD saves on its own: one fact, not a paragraph */
const MAX_AUTO_NOTE_CHARS = 200;

/**
 * Whether a fact from a summary still holds next session. Line numbers
 * change with the next edit, the session's own folder is known anyway,
 * and an item cut off mid-phrase says nothing (growing project g46: "
 * _budget_status at ~line 122", "summary() ~line", "project dir /home/…",
 * 2026-11-15).
 */
function lasting(text: string, folder?: string): boolean {
  if (/\blines?\s*~?\d|~\s*line|\bL\d+\b|:\d+(?:-\d+)?\b|~\s*\d/i.test(text))
    return false;
  if (/(?:~|\bat|\bin|\bline|\bto|\bof|\bthe|\band)\s*$/i.test(text))
    return false;
  if (/^(?:the\s+)?project\s+(?:dir|directory|folder)\b/i.test(text))
    return false;
  if (folder) {
    const clean = folder.replace(/[\\/]+$/, "");
    if (text.includes(clean)) return false;
  }
  return true;
}

/** A command, flag or code span makes a fact a "how to" */
function isHowto(text: string): boolean {
  return /`[^`]+`|(?:^|\s)--[a-z]|\b(?:python3?|npm|npx|pip|git|node|pytest|cargo|make)\s+\S/i.test(
    text
  );
}

/**
 * Notes from the model's summary note (taskCapsule's State / Decisions /
 * Next / Offered / Facts lines): its Facts and Decisions, one per item.
 * State, Next and Offered describe this session's progress, which goes
 * stale by the next one.
 */
export function notesFromSummary(
  note: string,
  folder?: string
): NoteCandidate[] {
  const out: NoteCandidate[] = [];
  for (const line of note.split("\n")) {
    const m = line
      .replace(/\*\*|__/g, "")
      .match(/^[\s*_-]*(Facts|Decisions)\b[^:\n]*:\s*(.*)$/i);
    if (!m) continue;
    const field = m[1]!.toLowerCase();
    // Items end at "; " or at a sentence's ". " (not "e.g. " or "~1.5 ")
    for (const part of m[2]!.split(/;\s+|(?<=[^\s.]{3})\.\s+/)) {
      const text = part.replace(/\.$/, "").trim();
      if (text.length < 12 || /^(none|nothing|n\/a)\b/i.test(text)) continue;
      if (text.length > MAX_AUTO_NOTE_CHARS || !checkNoteText(text).ok)
        continue;
      if (!lasting(text, folder)) continue;
      out.push({
        kind:
          field === "decisions" ? "decision" : isHowto(text) ? "howto" : "fact",
        text,
      });
    }
  }
  return out;
}

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
}

/** Share of words two notes have in common (Jaccard) */
export function wordOverlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

/** Share of the shorter note's words that the longer one also has */
export function wordContainment(a: string, b: string): number {
  // Every token here: "menu keys a/s/i/b" is mostly one-letter keys
  const tokens = (t: string) =>
    new Set(t.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []);
  const x = tokens(a);
  const y = tokens(b);
  const [small, large] = x.size <= y.size ? [x, y] : [y, x];
  if (small.size < 3) return 0;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size;
}

/**
 * How a new note relates to one SHIELD already has, without a model:
 * "same" when nearly all words and every file, command and flag match
 * (confirm the old one); "newer" when it is of the same kind, shares much
 * of its wording and names the same file, command or flag or a longer form
 * of one (the new one replaces it; the old one goes to the memory trash,
 * so a wrong guess is undone there); else "unrelated".
 */
export function noteRelation(
  old: Pick<MemoryNote, "kind" | "text" | "anchors">,
  next: NoteCandidate
): "same" | "newer" | "unrelated" {
  const overlap = wordOverlap(old.text, next.text);
  // One held inside the other: a shorter note repeats part of a longer one
  const was = new Set([...old.anchors, ...noteAnchors(old.text)]);
  const now = noteAnchors(next.text);
  const contained = wordContainment(old.text, next.text);
  if (contained >= 0.9) {
    // Nothing new in it: the same; with more words or another command, newer
    const nothingNew =
      words(next.text).size <= words(old.text).size &&
      now.every((anchor) => was.has(anchor));
    return nothingNew ? "same" : "newer";
  }
  const sameAnchors =
    now.length === was.size && now.every((anchor) => was.has(anchor));
  if (overlap >= 0.8 && sameAnchors) return "same";
  if (old.kind !== next.kind || overlap < 0.4) return "unrelated";
  // The same file, command or flag, or a longer form of one
  const shared = now.some((a) =>
    [...was].some((b) => a === b || a.includes(b) || b.includes(a))
  );
  return shared || overlap >= 0.8 ? "newer" : "unrelated";
}

/**
 * The numbers the model gave on its note's "Outdated:" line, for the
 * `count` notes it was shown (1-based in the note, 0-based here).
 */
export function outdatedNumbers(note: string, count: number): number[] {
  const line = note
    .replace(/\*\*|__/g, "")
    .match(/^[\s*_-]*Outdated\b[^:\n]*:\s*(.*)$/im)?.[1];
  if (!line || /^\s*(none|nothing|n\/a)\b/i.test(line)) return [];
  const found = new Set<number>();
  for (const m of line.matchAll(/\b(\d{1,2})\b/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= count) found.add(n - 1);
  }
  return [...found];
}

/**
 * Notes about the user from what they say about themselves, without a
 * model: only clear statements (their name, how they want answers, "from
 * now on…", what they use), so a request about the task is not mistaken
 * for one about them. Each is shown with an Undo as it is saved.
 */
export function userNotesFrom(message: string): NoteCandidate[] {
  // The user's own words only: not a pasted file, log or code block
  const text = message
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>[\s\S]*?<\/[^>]+>/g, " ");
  if (text.length > 2000) return [];
  const out: NoteCandidate[] = [];
  const add = (kind: NoteKind, note: string) => {
    const clean = note
      .replace(/\s+/g, " ")
      .replace(/[\s,;:]+$/, "")
      .trim();
    if (clean.length < 6 || clean.length > MAX_AUTO_NOTE_CHARS) return;
    if (!checkNoteText(clean).ok) return;
    if (!out.some((o) => o.text === clean)) out.push({ kind, text: clean });
  };
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const raw of sentences) {
    const s = raw.trim().replace(/[.!]+$/, "");
    let m: RegExpMatchArray | null;
    if (
      (m = s.match(/\b[Mm]y name is ([A-Z][\p{L}'-]+(?: [A-Z][\p{L}'-]+)?)/u))
    ) {
      add("fact", `The user's name is ${m[1]}`);
    }
    if ((m = s.match(/\b(?:[Pp]lease )?[Cc]all me ([A-Z][\p{L}'-]+)/u))) {
      add("preference", `Wants to be called ${m[1]}`);
    }
    if ((m = s.match(/\bfrom now on,?\s+(.+)/i))) {
      add("preference", `Asked, from now on: ${m[1]}`);
      continue;
    }
    if (
      (m = s.match(
        /\b(?:please\s+)?(always|never)\s+((?:use|write|answer|reply|respond|explain|give|show|add|ask|run|include|keep|put|format|make)\b.+)/i
      ))
    ) {
      add("preference", `Asked: ${m[1]!.toLowerCase()} ${m[2]}`);
      continue;
    }
    if (
      (m = s.match(
        /\bI (?:really )?(prefer|like|want)\s+((?:short|shorter|long|longer|brief|concise|detailed|simple|plain|step[- ]by[- ]step)\b.*\b(?:answers?|replies|responses|explanations?|summar(?:y|ies)|code|comments)\b.*)/i
      ))
    ) {
      add("preference", `Prefers ${m[2]}`);
    }
    if (
      (m = s.match(
        /\bI(?:'m| am) (?:on|using|running)\s+((?:Windows|Linux|Ubuntu|Fedora|Arch|macOS|a Mac|Mac)\b[\w .-]*)/i
      ))
    ) {
      add("fact", `Uses ${m[1]}`);
    }
  }
  return out;
}
