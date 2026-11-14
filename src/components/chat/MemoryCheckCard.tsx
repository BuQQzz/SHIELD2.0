/**
 * The memory check: a note SHIELD thinks may be out of date (a file it
 * names is gone, or the model's summary said its work showed it wrong) is
 * put to the user, one at a time and at most CHECKS_PER_SESSION a session.
 * Remove moves it to the memory trash (Settings › Memory restores it);
 * Keep confirms it; Edit changes it. The model never removes a note itself.
 */

import { useState } from "react";
import { Brain } from "lucide-react";
import { useMemoryNotesStore } from "@/stores/memory-notes-store";

const notesApi = () => window.electronAPI?.mcp?.notes;

export function MemoryCheckCard() {
  const note = useMemoryNotesStore((state) => state.toCheck[0]);
  const checked = useMemoryNotesStore((state) => state.checked);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  if (!note) return null;

  const done = () => {
    setEditing(false);
    setError("");
    checked(note.id);
  };
  const button =
    "shrink-0 rounded px-1.5 py-0.5 underline-offset-2 hover:underline";

  return (
    <div
      className="mx-auto flex w-full max-w-3xl items-center gap-2 px-5 text-xs text-muted-foreground"
      data-memory-check={note.id}
    >
      <Brain className="h-3.5 w-3.5 shrink-0" />
      {editing ? (
        <>
          <input
            className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-0.5 text-foreground"
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoFocus
            aria-label="Edit memory note"
          />
          <button
            className={`${button} text-foreground`}
            onClick={async () => {
              const result = await notesApi()?.edit(note.id, { text });
              if (result?.success) done();
              else setError(result?.error ?? "Could not save");
            }}
          >
            Save
          </button>
          <button className={button} onClick={() => setEditing(false)}>
            Cancel
          </button>
          {error && <span className="text-destructive">{error}</span>}
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate" title={note.text}>
            Memory check{note.staleReason ? ` (${note.staleReason})` : ""}: is
            this still true? &ldquo;{note.text}&rdquo;
          </span>
          <button
            className={`${button} text-foreground`}
            onClick={async () => {
              await notesApi()?.trash(note.id);
              done();
            }}
          >
            Remove
          </button>
          <button
            className={button}
            onClick={async () => {
              await notesApi()?.setStatus(note.id, "active");
              done();
            }}
          >
            Keep
          </button>
          <button
            className={button}
            onClick={() => {
              setText(note.text);
              setEditing(true);
            }}
          >
            Edit
          </button>
        </>
      )}
    </div>
  );
}

/**
 * What SHIELD just saved from the user's own words ("my name is…", "from
 * now on…"), with an Undo: saved without a model, so a wrong guess is one
 * click to take back.
 */
export function RememberedNotice() {
  const remembered = useMemoryNotesStore((state) => state.remembered);
  const undo = useMemoryNotesStore((state) => state.undo);
  const dismiss = useMemoryNotesStore((state) => state.dismiss);
  if (remembered.length === 0) return null;
  const button =
    "shrink-0 rounded px-1.5 py-0.5 underline-offset-2 hover:underline";
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-0.5 px-5 text-xs text-muted-foreground"
      data-remembered
    >
      {remembered.map((note) => (
        <div key={note.id} className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={note.text}>
            Remembered about you: {note.text}
          </span>
          <button
            className={`${button} text-foreground`}
            onClick={() => void undo(note.id)}
          >
            Undo
          </button>
          <button className={button} onClick={dismiss}>
            OK
          </button>
        </div>
      ))}
    </div>
  );
}
