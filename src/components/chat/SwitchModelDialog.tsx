/**
 * The caution shown when a model is switched in a chat that already has
 * messages. The new model would condition on turns it did not write, which
 * measurably drifts its output, and (on a local llama-server) the changed
 * system prompt costs a full, uncached re-read of the history. The reliable
 * fix is a fresh session opened with a short briefing, so that is offered
 * first; switching in place stays available.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SwitchModelDialogProps {
  open: boolean;
  /** The model that wrote this chat, and the one being chosen */
  fromModel?: string;
  toModel?: string;
  /** Writing the handoff and opening the new session */
  busy?: boolean;
  error?: string | null;
  onHandoff: () => void;
  onSwitchAnyway: () => void;
  onCancel: () => void;
}

export function SwitchModelDialog({
  open,
  fromModel,
  toModel,
  busy,
  error,
  onHandoff,
  onSwitchAnyway,
  onCancel,
}: SwitchModelDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Switch to {toModel ?? "another model"} in this chat?
          </DialogTitle>
          <DialogDescription>
            This chat was written by {fromModel ?? "another model"}. Switching
            in place makes the new model read turns it did not write, which can
            shift its answers, and it re-reads the whole chat on its first
            reply. Starting a fresh session with a short handoff is more
            reliable.
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Handoff asks {fromModel ?? "the current model"} to write a short
          briefing (goal, what is done, what is open, what to avoid), then
          starts a new session on {toModel ?? "the new model"} with it, ready to
          send. Switch anyway keeps this chat and its history.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={onSwitchAnyway} disabled={busy}>
              Switch anyway
            </Button>
            <Button onClick={onHandoff} disabled={busy}>
              {busy ? "Writing the handoff…" : "Hand off & start new session"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
