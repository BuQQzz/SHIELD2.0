import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settingsStore";
import { useMCP } from "@/hooks/useMCP";
import { Shield, Database, AlertCircle, CheckCircle2, Wrench } from "lucide-react";
import type { MCPSettings as MCPSettingsType } from "@/types/settings";
import { AuditLogViewer } from "@/components/dialogs/AuditLogViewer";
import { ToolsExplorer } from "@/components/dialogs/ToolsExplorer";

interface MCPSettingsProps {
  settings: MCPSettingsType;
}

export function MCPSettings({ settings }: MCPSettingsProps) {
  const { updateSettings } = useSettingsStore();
  const { isReady, isInitializing, initialize, audit } = useMCP();
  const [showAuditViewer, setShowAuditViewer] = useState(false);
  const [showToolsExplorer, setShowToolsExplorer] = useState(false);

  const handleToggle = async (key: keyof MCPSettingsType, value: boolean) => {
    await updateSettings({
      mcp: {
        ...settings,
        [key]: value,
      },
    });

    // Auto-initialize if enabled and autoInitialize is true
    if (key === "enabled" && value && settings.autoInitialize && !isReady) {
      await initialize();
    }
  };

  const handleManualInitialize = async () => {
    await initialize();
  };

  const handleViewAuditLogs = () => {
    setShowAuditViewer(true);
  };

  const handleClearAuditLogs = async () => {
    if (
      confirm(
        "Are you sure you want to clear all audit logs? This action cannot be undone."
      )
    ) {
      await audit.clear();
      alert("Audit logs cleared successfully.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold">MCP Integration</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Enable Model Context Protocol for tool integration and system
          operations with explicit permission controls.
        </p>
      </div>

      {/* Status Indicator */}
      <div className="rounded-lg border p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isReady ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">MCP Service Ready</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">MCP Service Inactive</span>
              </>
            )}
          </div>
          {!isReady && settings.enabled && (
            <Button
              size="sm"
              onClick={handleManualInitialize}
              disabled={isInitializing}
            >
              {isInitializing ? "Initializing..." : "Initialize Now"}
            </Button>
          )}
        </div>
      </div>

      {/* Enable MCP */}
      <div className="flex items-center justify-between space-x-2">
        <div className="space-y-0.5 flex-1">
          <Label>Enable MCP Integration</Label>
          <p className="text-sm text-muted-foreground">
            Allow AI to use external tools and services with your permission
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(checked) => handleToggle("enabled", checked)}
        />
      </div>

      {/* Auto-Initialize */}
      <div className="flex items-center justify-between space-x-2">
        <div className="space-y-0.5 flex-1">
          <Label>Auto-Initialize on Startup</Label>
          <p className="text-sm text-muted-foreground">
            Automatically start MCP service when the app launches
          </p>
        </div>
        <Switch
          checked={settings.autoInitialize}
          onCheckedChange={(checked) => handleToggle("autoInitialize", checked)}
          disabled={!settings.enabled}
        />
      </div>

      {/* Permission Dialog */}
      <div className="flex items-center justify-between space-x-2">
        <div className="space-y-0.5 flex-1">
          <Label>Show Permission Dialogs</Label>
          <p className="text-sm text-muted-foreground">
            Require explicit approval for each MCP operation
          </p>
        </div>
        <Switch
          checked={settings.showPermissionDialog}
          onCheckedChange={(checked) =>
            handleToggle("showPermissionDialog", checked)
          }
          disabled={!settings.enabled}
        />
      </div>

      {/* Remember Choices */}
      <div className="flex items-center justify-between space-x-2">
        <div className="space-y-0.5 flex-1">
          <Label>Remember Permission Choices</Label>
          <p className="text-sm text-muted-foreground">
            Save your approval/denial decisions for repeated operations
          </p>
        </div>
        <Switch
          checked={settings.rememberChoices}
          onCheckedChange={(checked) => handleToggle("rememberChoices", checked)}
          disabled={!settings.enabled || !settings.showPermissionDialog}
        />
      </div>

      {/* Allowed Servers */}
      <div className="space-y-2">
        <Label>Allowed MCP Servers</Label>
        <div className="rounded-md border p-3 bg-muted/30">
          <div className="flex flex-wrap gap-2">
            {settings.allowedServers.map((server) => (
              <span
                key={server}
                className="inline-flex items-center rounded-md bg-blue-100 dark:bg-blue-900 px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-300"
              >
                {server}
              </span>
            ))}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <p className="text-xs text-muted-foreground">
            Only whitelisted official MCP servers are permitted for security
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowToolsExplorer(true)}
            disabled={!settings.enabled || !isReady}
          >
            <Wrench className="h-4 w-4 mr-1" />
            Browse Tools
          </Button>
        </div>
      </div>

      {/* Audit Logs */}
      <div className="space-y-3 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          <h4 className="font-medium">Audit Logs</h4>
        </div>

        <div className="flex items-center justify-between space-x-2">
          <div className="space-y-0.5 flex-1">
            <Label>Retention Period</Label>
            <p className="text-sm text-muted-foreground">
              Keep audit logs for {settings.auditLogRetentionDays} days
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewAuditLogs}
            disabled={!settings.enabled}
          >
            View Logs
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAuditLogs}
            disabled={!settings.enabled}
          >
            Clear Logs
          </Button>
        </div>
      </div>

      {/* Security Notice */}
      <div className="rounded-lg border border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950 p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Privacy & Security
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              All MCP operations are logged locally and require your explicit
              permission. No data is sent to external servers. Only official MCP
              servers from trusted sources are allowed.
            </p>
          </div>
        </div>
      </div>

      {/* Audit Log Viewer Dialog */}
      <AuditLogViewer
        open={showAuditViewer}
        onOpenChange={setShowAuditViewer}
      />

      {/* Tools Explorer Dialog */}
      <ToolsExplorer
        open={showToolsExplorer}
        onOpenChange={setShowToolsExplorer}
      />
    </div>
  );
}
