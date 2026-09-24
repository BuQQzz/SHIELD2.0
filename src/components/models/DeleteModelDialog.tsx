/**
 * Delete Model Dialog
 * Confirmation dialog for deleting downloaded models
 */

import { Trash2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ModelMetadata } from "@/config/models";

interface DeleteModelDialogProps {
  open: boolean;
  model: ModelMetadata | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteModelDialog({
  open,
  model,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: DeleteModelDialogProps) {
  if (!model) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <DialogTitle>Delete Model</DialogTitle>
              <DialogDescription className="mt-1">
                The files go to the Recycle Bin
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="font-medium">{model.displayName}</div>
            <div className="text-sm text-muted-foreground">
              {model.provider} • {model.size}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Delete this model? Its files are moved to the Recycle Bin, where you
            can restore them. Other apps that share your models folder will lose
            them too until they are restored.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            {isDeleting ? "Deleting..." : "Delete Model"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
