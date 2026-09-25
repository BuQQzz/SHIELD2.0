/**
 * Low Memory Dialog
 * Shown when a model needs more system memory than is free. Nothing has
 * been unloaded or loaded yet; the user decides.
 */

import { MemoryStick } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { MemoryPrompt } from "@/hooks/useLlama";

interface LowMemoryDialogProps {
  prompt: MemoryPrompt | null;
  onContinue: () => void;
  onCancel: () => void;
}

export function LowMemoryDialog({
  prompt,
  onContinue,
  onCancel,
}: LowMemoryDialogProps) {
  if (!prompt) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/10">
              <MemoryStick className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <DialogTitle>Not enough free memory</DialogTitle>
              <DialogDescription className="mt-1">
                {prompt.model.name} runs partly from system RAM
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <ul className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
            {prompt.check.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Closing other apps frees memory. A smaller context in the Library
            also lowers what the model needs.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onContinue}>Load anyway</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
