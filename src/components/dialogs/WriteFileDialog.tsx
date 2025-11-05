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
import { AlertTriangle, FileText, FolderOpen, Shield } from "lucide-react";

export interface WriteFileRequest {
  path: string;
  content: string;
  fileExists?: boolean;
}

interface WriteFileDialogProps {
  open: boolean;
  request: WriteFileRequest | null;
  onApprove: (remember: boolean) => void;
  onDeny: (remember: boolean) => void;
}

export function WriteFileDialog({
  open,
  request,
  onApprove,
  onDeny,
}: WriteFileDialogProps) {
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

  const isRestrictedPath = (path: string): boolean => {
    const restricted = ["C:\\Windows", "C:\\Program Files", "C:\\System32"];
    return restricted.some((r) => path.startsWith(r));
  };

  const getDangerousExtensions = (): string[] => {
    return [".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".scr", ".msi"];
  };

  const hasDangerousExtension = (path: string): boolean => {
    const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
    return getDangerousExtensions().includes(ext);
  };

  const pathIsRestricted = isRestrictedPath(request.path);
  const isDangerous = hasDangerousExtension(request.path);
  const hasWarning = pathIsRestricted || isDangerous || request.fileExists;

  const getFileName = (path: string): string => {
    return path.substring(path.lastIndexOf("\\") + 1);
  };

  const getFileSize = (content: string): string => {
    const bytes = new Blob([content]).size;
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={() => handleDeny()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-yellow-500" />
            Write File Permission
          </DialogTitle>
          <DialogDescription>
            {request.fileExists
              ? "The AI wants to overwrite an existing file on your system."
              : "The AI wants to create a new file on your system."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Path Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              <span className="text-sm font-medium">File Path:</span>
            </div>
            <div
              className={`rounded-md p-2 font-mono text-xs ${
                pathIsRestricted || isDangerous
                  ? "border-2 border-red-500 bg-red-50 dark:bg-red-950"
                  : request.fileExists
                    ? "border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                    : "bg-muted"
              }`}
            >
              {request.path}
            </div>
          </div>

          {/* File Info */}
          <div className="grid grid-cols-2 gap-4 rounded-md bg-muted p-3">
            <div>
              <span className="text-xs text-muted-foreground">File Name</span>
              <p className="font-medium text-sm">{getFileName(request.path)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Size</span>
              <p className="font-medium text-sm">{getFileSize(request.content)}</p>
            </div>
          </div>

          {/* Warnings */}
          {hasWarning && (
            <div className="space-y-2">
              {pathIsRestricted && (
                <div className="flex items-start gap-2 rounded-md border-2 border-red-500 bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    This operation targets a restricted system directory and may
                    affect system stability.
                  </p>
                </div>
              )}
              {isDangerous && (
                <div className="flex items-start gap-2 rounded-md border-2 border-red-500 bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    This file has a potentially dangerous extension (
                    {request.path.substring(request.path.lastIndexOf("."))}).
                    Executable files can harm your system.
                  </p>
                </div>
              )}
              {request.fileExists && !pathIsRestricted && !isDangerous && (
                <div className="flex items-start gap-2 rounded-md border-2 border-yellow-500 bg-yellow-50 p-3 text-sm text-yellow-600 dark:bg-yellow-950 dark:text-yellow-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <p>
                    This will overwrite the existing file. The original content will
                    be lost.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Content Preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="text-sm font-medium">Content Preview:</span>
            </div>
            <div className="h-48 overflow-auto rounded-md border bg-muted">
              <pre className="p-4 text-xs font-mono">
                {request.content.substring(0, 2000)}
                {request.content.length > 2000 && "\n\n... (content truncated)"}
              </pre>
            </div>
          </div>

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
              Remember my choice for writing to this location
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleDeny}>
            Deny
          </Button>
          <Button
            onClick={handleApprove}
            variant={pathIsRestricted || isDangerous ? "destructive" : "default"}
            disabled={pathIsRestricted || isDangerous}
          >
            {pathIsRestricted || isDangerous
              ? "Access Denied"
              : request.fileExists
                ? "Overwrite File"
                : "Create File"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
