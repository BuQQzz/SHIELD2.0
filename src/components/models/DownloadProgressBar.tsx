import { motion } from "framer-motion";
import { Download, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type DownloadProgress } from "@/types/electron";

interface DownloadProgressBarProps {
  progress: DownloadProgress;
  className?: string;
  showDetails?: boolean;
  size?: "sm" | "md" | "lg";
}

export function DownloadProgressBar({
  progress,
  className,
  showDetails = true,
  size = "md",
}: DownloadProgressBarProps) {
  const {
    status,
    progress: percentage,
    downloadedBytes,
    totalBytes,
  } = progress;

  // Format bytes to human-readable
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Get status color
  const getStatusColor = () => {
    switch (status) {
      case "completed":
        return "text-green-500";
      case "error":
      case "cancelled":
        return "text-red-500";
      case "downloading":
        return "text-blue-500";
      default:
        return "text-muted-foreground";
    }
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle className={cn("h-4 w-4", getStatusColor())} />;
      case "error":
      case "cancelled":
        return <XCircle className={cn("h-4 w-4", getStatusColor())} />;
      case "downloading":
        return (
          <Loader2 className={cn("h-4 w-4 animate-spin", getStatusColor())} />
        );
      default:
        return <Download className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Height based on size
  const heightClass = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  }[size];

  return (
    <div
      className={cn("space-y-2 p-3 rounded-md bg-muted/50 border", className)}
    >
      {/* Progress Bar */}
      <div
        className={cn(
          "w-full bg-background rounded-full overflow-hidden border",
          heightClass
        )}
      >
        <motion.div
          className={cn(
            "h-full rounded-full",
            status === "completed"
              ? "bg-green-500"
              : status === "error" || status === "cancelled"
                ? "bg-red-500"
                : "bg-blue-500"
          )}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />
      </div>

      {/* Details */}
      {showDetails && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className={cn("font-semibold", getStatusColor())}>
              {status === "downloading" && `${percentage.toFixed(1)}%`}
              {status === "completed" && "Complete"}
              {status === "error" && "Failed"}
              {status === "cancelled" && "Cancelled"}
            </span>
          </div>

          {status === "downloading" && totalBytes > 0 && (
            <div className="flex items-center text-muted-foreground font-medium">
              <span className="whitespace-nowrap">
                {formatBytes(downloadedBytes || 0)} /{" "}
                {formatBytes(totalBytes || 0)}
              </span>
            </div>
          )}

          {status === "error" && progress.error && (
            <span className="text-red-500 text-xs truncate max-w-xs">
              {progress.error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
