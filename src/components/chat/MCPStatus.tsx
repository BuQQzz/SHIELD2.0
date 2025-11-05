/**
 * MCP Status Indicator & Toggle
 * 
 * Clickable button to enable/disable MCP from main UI
 * Syncs with settings store and respects model capabilities
 */

import { useMCP } from "@/hooks/useMCP";
import { useSettingsStore } from "@/store/settingsStore";
import { useModelCapabilities } from "@/hooks/useModelCapabilities";
import { Button } from "@/components/ui/button";
import { Shield, AlertCircle, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import type { ModelOption } from "./ModelSelector";

interface MCPStatusProps {
  currentModel?: ModelOption | null;
}

export function MCPStatus({ currentModel }: MCPStatusProps) {
  const { isReady, isInitializing, error, initialize } = useMCP();
  const { settings, updateSettings } = useSettingsStore();
  const { getWarning } = useModelCapabilities(currentModel || null);
  const mcpEnabled = settings.mcp?.enabled ?? false;

  const handleToggle = async () => {
    const newState = !mcpEnabled;
    
    // Update settings
    await updateSettings({ mcp: { ...settings.mcp, enabled: newState } });

    // Auto-initialize when enabling
    if (newState && !isReady && !isInitializing) {
      await initialize();
    }
  };

  // Check if model supports MCP well
  const warning = getWarning('mcp');
  const hasWarning = warning !== null;

  // Show error state
  if (error) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className="gap-2 text-destructive hover:text-destructive"
        title={`MCP Error: ${error} - Click to ${mcpEnabled ? 'disable' : 'retry'}`}
      >
        <AlertCircle className="h-4 w-4" />
        <span className="text-xs">MCP Error</span>
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
        className="gap-2 text-muted-foreground cursor-wait"
        title="MCP is initializing..."
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Initializing...</span>
      </Button>
    );
  }

  // Show ready state with warning if model doesn't support it well
  if (isReady && mcpEnabled) {
    if (hasWarning) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          className="gap-2 text-yellow-600 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-300"
          title={`MCP Ready (Limited) - ${warning} - Click to disable`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs">MCP Limited</span>
        </Button>
      );
    }
    
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className="gap-2 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
        title="MCP Ready - Click to disable"
      >
        <CheckCircle2 className="h-4 w-4" />
        <span className="text-xs">MCP Ready</span>
      </Button>
    );
  }

  // Show inactive state (default)
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleToggle}
      className="gap-2 text-muted-foreground hover:text-foreground"
      title={hasWarning ? `${warning} - Click to enable anyway` : "MCP Inactive - Click to enable"}
    >
      <Shield className="h-4 w-4" />
      <span className="text-xs">MCP Off</span>
    </Button>
  );
}
