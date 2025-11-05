import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settingsStore";
import { useMCP } from "@/hooks/useMCP";
import { useModelCapabilities } from "@/hooks/useModelCapabilities";
import { AlertTriangle } from "lucide-react";
import type { MCPSettings as MCPSettingsType } from "@/types/settings";
import type { ModelOption } from "@/components/chat/ModelSelector";

interface MCPSettingsProps {
  settings: MCPSettingsType;
  currentModel?: ModelOption | null;
}

export function MCPSettings({ settings, currentModel }: MCPSettingsProps) {
  const { updateSettings } = useSettingsStore();
  const { isReady, isInitializing, initialize } = useMCP();
  const { getWarning } = useModelCapabilities(currentModel || null);

  const warning = getWarning("mcp");
  const hasWarning = warning !== null;

  const handleToggleMCP = async (enabled: boolean) => {
    // Update settings first
    await updateSettings({ mcp: { ...settings, enabled } });

    // Auto-initialize when enabling
    if (enabled && !isReady && !isInitializing) {
      await initialize();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">MCP Integration</h3>
        <p className="text-sm text-muted-foreground">
          Enable filesystem tools for AI assistance
        </p>
      </div>

      {hasWarning && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-yellow-800 dark:text-yellow-200">
            <p className="font-medium mb-1">Model Limitation</p>
            <p>{warning}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Enable MCP</Label>
          <div className="text-sm text-muted-foreground">
            {settings.enabled
              ? "AI can access files in Documents and Desktop"
              : "Turn on to enable filesystem operations"}
          </div>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={handleToggleMCP}
          disabled={isInitializing}
        />
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Click the MCP button in the header to quickly toggle</p>
        <p>• Status indicator shows: Off → Initializing → Ready</p>
        <p>• Only Desktop and Documents folders are accessible</p>
        <p>• All operations require your explicit permission</p>
      </div>
    </div>
  );
}
