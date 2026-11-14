/**
 * Settings › Memory: what SHIELD remembers (src/config/memoryNotes.ts). The
 * user sees every note, edits or removes it, and restores it from the
 * memory trash; only the user empties the trash.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, RotateCcw, Trash2, Check, X } from "lucide-react";
import {
  NOTE_KINDS,
  NOTE_KIND_LABELS,
  type MemoryNote,
  type NoteKind,
} from "@/config/memoryNotes";

const notesApi = () => window.electronAPI?.mcp?.notes;

function scopeTitle(scope: string): string {
  return scope === "user" ? "About you" : scope.slice("folder:".length);
}

function NoteRow({
  note,
  onChanged,
}: {
  note: MemoryNote;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.text);
  const [error, setError] = useState("");
  const trashed = note.status === "trashed";

  const save = async () => {
    const result = await notesApi()?.edit(note.id, { text });
    if (result?.success) {
      setEditing(false);
      setError("");
      onChanged();
    } else {
      setError(result?.error ?? "Could not save");
    }
  };

  return (
    <li className="flex items-start gap-2 py-1.5 text-sm" data-note={note.id}>
      <span className="w-20 shrink-0 pt-0.5 text-xs text-muted-foreground">
        {NOTE_KIND_LABELS[note.kind]}
      </span>
      {editing ? (
        <div className="min-w-0 flex-1">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
              if (event.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
          {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        </div>
      ) : (
        <span
          className={`min-w-0 flex-1 break-words ${trashed ? "text-muted-foreground line-through" : ""}`}
        >
          {note.text}
          {note.status === "stale" && (
            <span className="ml-1 text-xs text-amber-600">
              (may be out of date)
            </span>
          )}
        </span>
      )}
      <span className="flex shrink-0 gap-1">
        {editing ? (
          <>
            <Button size="icon" variant="ghost" title="Save" onClick={save}>
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Cancel"
              onClick={() => setEditing(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : trashed ? (
          <Button
            size="icon"
            variant="ghost"
            title="Restore"
            onClick={async () => {
              await notesApi()?.restore(note.id);
              onChanged();
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : (
          <>
            <Button
              size="icon"
              variant="ghost"
              title="Edit"
              onClick={() => {
                setText(note.text);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Remove (to the memory trash)"
              onClick={async () => {
                await notesApi()?.trash(note.id);
                onChanged();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </span>
    </li>
  );
}

export function MemorySettings() {
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<NoteKind>("preference");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const result = await notesApi()?.list();
    if (result?.success) setNotes(result.notes ?? []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    const result = await notesApi()?.add({ folder: null, kind, text });
    if (result?.success) {
      setText("");
      setError("");
      void refresh();
    } else {
      setError(result?.error ?? "Could not save");
    }
  };

  const live = notes.filter((note) => note.status !== "trashed");
  const trash = notes.filter((note) => note.status === "trashed");
  const scopes = [...new Set(live.map((note) => note.scope))].sort((a, b) =>
    a === "user" ? -1 : b === "user" ? 1 : a.localeCompare(b)
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Short notes SHIELD keeps about you and each project folder. New chats
        and sessions start with them, so you don't have to repeat yourself. Ask
        the model to &quot;remember&quot; something, or add a note here. Notes
        stay on this computer.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value as NoteKind)}
          aria-label="Kind of note"
        >
          {NOTE_KINDS.map((k) => (
            <option key={k} value={k}>
              {NOTE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <Input
          className="min-w-0 flex-1"
          placeholder="Something about you to remember, e.g. I prefer short answers"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && text.trim()) void add();
          }}
        />
        <Button onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {scopes.length === 0 && (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}
      {scopes.map((scope) => (
        <div key={scope}>
          <h4 className="truncate text-xs font-semibold" title={scope}>
            {scopeTitle(scope)}
          </h4>
          <ul>
            {live
              .filter((note) => note.scope === scope)
              .map((note) => (
                <NoteRow key={note.id} note={note} onChanged={refresh} />
              ))}
          </ul>
        </div>
      ))}

      {trash.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold">
              Memory trash ({trash.length})
            </h4>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                if (
                  confirm(
                    `Delete ${trash.length} note(s) in the memory trash for good? This cannot be undone.`
                  )
                ) {
                  await notesApi()?.emptyTrash();
                  void refresh();
                }
              }}
            >
              Empty trash
            </Button>
          </div>
          <ul>
            {trash.map((note) => (
              <NoteRow key={note.id} note={note} onChanged={refresh} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
