/**
 * MCP Status Indicator
 * 
 * Simple component showing MCP integration status
 */

import { useMCP } from "@/hooks/useMCP";
import { Button } from "@/components/ui/button";
import { Shield, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function MCPStatus() {
  const { isReady, isInitializing, error, initialize } = useMCP();

  if (!isReady && !isInitializing && !error) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={initialize}
        className="gap-2 text-muted-foreground"
        title="MCP Integration - Click to initialize"
      >
        <Shield className="h-4 w-4" />
        <span className="text-xs">MCP Inactive</span>
      </Button>
    );
  }

  if (isInitializing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Initializing...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-destructive"
        title={error}
      >
        <AlertCircle className="h-4 w-4" />
        <span className="text-xs">MCP Error</span>
      </div>
    );
  }

  if (isReady) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-green-600 dark:text-green-400"
        title="MCP Integration Ready"
      >
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-xs">MCP Ready</span>
      </div>
    );
  }

  return null;
}
