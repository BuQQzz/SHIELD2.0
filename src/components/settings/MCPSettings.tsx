import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settingsStore";
import { useMCP } from "@/hooks/useMCP";
import { Shield, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { MCPSettings as MCPSettingsType } from "@/types/settings";

interface MCPSettingsProps {
  settings: MCPSettingsType;
}

export function MCPSettings({ settings }: MCPSettingsProps) {
  const { updateSettings } = useSettingsStore();
  const { isReady, isInitializing, initialize } = useMCP();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">MCP Integration</h3>
        <p className="text-sm text-muted-foreground">Enable filesystem tools for AI</p>
      </div>

      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5" />
          <div>
            <div className="font-medium">MCP Status</div>
            <div className="text-sm">
              {isReady && <span className="text-green-600"><CheckCircle2 className="h-3 w-3 inline" /> Ready</span>}
              {!isReady && !isInitializing && <span><XCircle className="h-3 w-3 inline" /> Not initialized</span>}
              {isInitializing && <span><Loader2 className="h-3 w-3 inline animate-spin" /> Initializing...</span>}
            </div>
          </div>
        </div>
        {!isReady && !isInitializing && <Button onClick={initialize} size="sm">Initialize</Button>}
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label>Enable MCP</Label>
          <div className="text-sm text-muted-foreground">Allow AI filesystem access</div>
        </div>
        <Switch checked={settings.enabled} onCheckedChange={(v) => updateSettings({ mcp: { ...settings, enabled: v } })} />
      </div>
    </div>
  );
}
