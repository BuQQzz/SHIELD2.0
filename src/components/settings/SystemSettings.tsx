import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settingsStore";
import { SystemSettings as SystemSettingsType } from "@/types/settings";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Monitor } from "lucide-react";

interface SystemSettingsProps {
  settings: SystemSettingsType;
}

export function SystemSettings({ settings }: SystemSettingsProps) {
  const { updateSettings } = useSettingsStore();
  const { theme, setTheme } = useTheme();

  const handleSystemPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    updateSettings({ system: { ...settings, systemPrompt: e.target.value } });
  };

  const handleAutoSaveChange = (checked: boolean) => {
    updateSettings({ system: { ...settings, autoSave: checked } });
  };

  const handleConfirmDeleteChange = (checked: boolean) => {
    updateSettings({ system: { ...settings, confirmDelete: checked } });
  };

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    updateSettings({ system: { ...settings, theme: newTheme } });
  };

  return (
    <div className="space-y-6">
      <div>
        <Label>Theme</Label>
        <div className="flex gap-2 mt-2">
          <Button
            variant={theme === "light" ? "default" : "outline"}
            size="sm"
            onClick={() => handleThemeChange("light")}
            className="flex-1"
          >
            <Sun className="h-4 w-4 mr-2" />
            Light
          </Button>
          <Button
            variant={theme === "dark" ? "default" : "outline"}
            size="sm"
            onClick={() => handleThemeChange("dark")}
            className="flex-1"
          >
            <Moon className="h-4 w-4 mr-2" />
            Dark
          </Button>
          <Button
            variant={theme === "system" ? "default" : "outline"}
            size="sm"
            onClick={() => handleThemeChange("system")}
            className="flex-1"
          >
            <Monitor className="h-4 w-4 mr-2" />
            System
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Choose your preferred color scheme
        </p>
      </div>
      <div>
        <Label htmlFor="system-prompt">System Prompt</Label>
        <Textarea
          id="system-prompt"
          value={settings.systemPrompt}
          onChange={handleSystemPromptChange}
          placeholder="You are a helpful AI assistant..."
          className="mt-2 min-h-[100px]"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Set the AI's behavior and personality
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="auto-save">Auto-save conversations</Label>
          <p className="text-xs text-muted-foreground">
            Automatically save after each message
          </p>
        </div>
        <Switch
          id="auto-save"
          checked={settings.autoSave}
          onCheckedChange={handleAutoSaveChange}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="confirm-delete">Confirm before deleting</Label>
          <p className="text-xs text-muted-foreground">
            Show confirmation when deleting conversations
          </p>
        </div>
        <Switch
          id="confirm-delete"
          checked={settings.confirmDelete}
          onCheckedChange={handleConfirmDeleteChange}
        />
      </div>
    </div>
  );
}
