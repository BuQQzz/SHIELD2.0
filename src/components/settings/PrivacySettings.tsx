import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/store/settingsStore";
import { PrivacySettings as PrivacySettingsType } from "@/types/settings";
import { Shield, Download, Upload, RotateCcw } from "lucide-react";
import { useState } from "react";

interface PrivacySettingsProps {
  settings: PrivacySettingsType;
}

export function PrivacySettings({ settings }: PrivacySettingsProps) {
  const { updateSettings, exportSettings, importSettings, resetSettings } =
    useSettingsStore();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleTelemetryChange = (checked: boolean) => {
    updateSettings({ privacy: { ...settings, telemetry: checked } });
  };

  const handleAnalyticsChange = (checked: boolean) => {
    updateSettings({ privacy: { ...settings, analytics: checked } });
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const filePath = await exportSettings();
      if (filePath) {
        console.log("Settings exported to:", filePath);
      }
    } catch (error) {
      console.error("Failed to export settings:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      await importSettings();
    } catch (error) {
      console.error("Failed to import settings:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleReset = async () => {
    if (
      confirm(
        "Are you sure you want to reset all settings to defaults? This cannot be undone."
      )
    ) {
      setIsResetting(true);
      try {
        await resetSettings();
      } catch (error) {
        console.error("Failed to reset settings:", error);
      } finally {
        setIsResetting(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
        <Shield className="h-5 w-5 text-primary mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">Privacy-First Design</p>
          <p className="text-xs text-muted-foreground">
            All AI processing happens locally on your device. Your conversations
            never leave your computer.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="telemetry">Send telemetry data</Label>
          <p className="text-xs text-muted-foreground">
            Help improve SHIELD by sending anonymous usage data
          </p>
        </div>
        <Switch
          id="telemetry"
          checked={settings.telemetry}
          onCheckedChange={handleTelemetryChange}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="analytics">Enable analytics</Label>
          <p className="text-xs text-muted-foreground">
            Collect anonymous analytics to understand feature usage
          </p>
        </div>
        <Switch
          id="analytics"
          checked={settings.analytics}
          onCheckedChange={handleAnalyticsChange}
        />
      </div>

      <div className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
        <p className="font-medium mb-1">Note:</p>
        <p>
          Even with telemetry enabled, your actual conversations and personal
          data are never transmitted. Only aggregated, anonymous usage metrics
          are collected.
        </p>
      </div>

      <div className="space-y-3 pt-4 border-t">
        <h3 className="text-sm font-medium">Settings Management</h3>

        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
            className="justify-start"
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? "Exporting..." : "Export Settings"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={isImporting}
            className="justify-start"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isImporting ? "Importing..." : "Import Settings"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={isResetting}
            className="justify-start text-destructive hover:text-destructive"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {isResetting ? "Resetting..." : "Reset to Defaults"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Export your settings to backup or share them. Import settings from a
          previously exported file.
        </p>
      </div>
    </div>
  );
}
