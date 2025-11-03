import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settingsStore";
import { PrivacySettings as PrivacySettingsType } from "@/types/settings";
import { Shield } from "lucide-react";

interface PrivacySettingsProps {
  settings: PrivacySettingsType;
}

export function PrivacySettings({ settings }: PrivacySettingsProps) {
  const { updateSettings } = useSettingsStore();

  const handleTelemetryChange = (checked: boolean) => {
    updateSettings({ privacy: { ...settings, telemetry: checked } });
  };

  const handleAnalyticsChange = (checked: boolean) => {
    updateSettings({ privacy: { ...settings, analytics: checked } });
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
    </div>
  );
}
