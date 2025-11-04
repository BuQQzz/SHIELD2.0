import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle, FolderOpen, Shield } from "lucide-react";

export interface PermissionRequest {
  serverName: string;
  toolName: string;
  arguments?: Record<string, unknown>;
  description?: string;
}

interface PermissionDialogProps {
  open: boolean;
  request: PermissionRequest | null;
  onApprove: (remember: boolean) => void;
  onDeny: (remember: boolean) => void;
}

export function PermissionDialog({
  open,
  request,
  onApprove,
  onDeny,
}: PermissionDialogProps) {
  const [rememberChoice, setRememberChoice] = useState(false);

  if (!request) return null;

  const handleApprove = () => {
    onApprove(rememberChoice);
    setRememberChoice(false);
  };

  const handleDeny = () => {
    onDeny(rememberChoice);
    setRememberChoice(false);
  };

  const isFilesystemOperation = request.serverName === "filesystem";
  const targetPath = request.arguments?.path as string | undefined;

  const isRestrictedPath = (path: string | undefined): boolean => {
    if (!path) return false;
    const restricted = ["C:\\Windows", "C:\\Program Files", "C:\\System32"];
    return restricted.some((r) => path.startsWith(r));
  };

  const pathIsRestricted = isRestrictedPath(targetPath);

  return (
    <Dialog open={open} onOpenChange={() => handleDeny()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-500" />
            Permission Required
          </DialogTitle>
          <DialogDescription>
            An MCP server is requesting to perform an operation on your system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Server and Tool Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Server:</span>
              <span className="rounded-md border px-2 py-1 text-xs font-mono">
                {request.serverName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Tool:</span>
              <span className="rounded-md border px-2 py-1 text-xs font-mono">
                {request.toolName}
              </span>
            </div>
          </div>

          {/* Description */}
          {request.description && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm">{request.description}</p>
            </div>
          )}

          {/* Filesystem-specific info */}
          {isFilesystemOperation && targetPath && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                <span className="text-sm font-medium">Target Path:</span>
              </div>
              <div
                className={`rounded-md p-2 font-mono text-xs ${
                  pathIsRestricted
                    ? "border-2 border-red-500 bg-red-50 dark:bg-red-950"
                    : "bg-muted"
                }`}
              >
                {targetPath}
              </div>
              {pathIsRestricted && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    This operation targets a restricted system directory and may
                    affect system stability.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Arguments (excluding path since shown above) */}
          {request.arguments && Object.keys(request.arguments).length > 0 && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Arguments:</span>
              <div className="max-h-40 overflow-auto rounded-md bg-muted p-3">
                <pre className="text-xs">
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(request.arguments).filter(
                        ([key]) => key !== "path"
                      )
                    ),
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}

          {/* Remember choice */}
          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="remember"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label
              htmlFor="remember"
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Remember my choice for this operation
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDeny}>
            Deny
          </Button>
          <Button
            onClick={handleApprove}
            variant={pathIsRestricted ? "destructive" : "default"}
            disabled={pathIsRestricted}
          >
            {pathIsRestricted ? "Access Denied" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
