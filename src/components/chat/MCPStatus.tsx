/**
 * MCP Status Indicator
 *
 * Read-only status indicator for always-on MCP
 */

import { useMCP } from "@/hooks/useMCP";
import { useModelCapabilities } from "@/hooks/useModelCapabilities";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { ModelOption } from "@/config/models";

interface MCPStatusProps {
  currentModel?: ModelOption | null;
}

export function MCPStatus({ currentModel }: MCPStatusProps) {
  const { isReady, isInitializing, error } = useMCP();
  const { getWarning } = useModelCapabilities(currentModel || null);

  // Check if model supports MCP well
  const warning = getWarning("mcp");
  const hasWarning = warning !== null;

  // Show error state
  if (error) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="px-2 text-destructive hover:text-destructive"
        title={`MCP Error: ${error}`}
      >
        <AlertCircle className="h-4 w-4" />
      </Button>
    );
  }

  // Show initializing state
  if (isInitializing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="px-2 text-muted-foreground cursor-wait"
        title="MCP is initializing..."
      >
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  if (isReady) {
    if (hasWarning) {
      return (
        <Button
          variant="ghost"
          size="sm"
          disabled
          className="px-2 text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300"
          title={`MCP Ready (Limited): ${warning}`}
        >
          <AlertTriangle className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        className="px-2 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
        title="MCP Ready"
      >
        <CheckCircle2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled
      className="px-2 text-muted-foreground"
      title="MCP Initializing"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
    </Button>
  );
}
