import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settingsStore";
import { SystemSettings as SystemSettingsType } from "@/types/settings";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Monitor, Check, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { HuggingFaceTokenInput } from "./HuggingFaceTokenInput";

interface SystemSettingsProps {
  settings: SystemSettingsType;
  onApplySystemPrompt?: (prompt: string) => Promise<void>;
}

export function SystemSettings({
  settings,
  onApplySystemPrompt,
}: SystemSettingsProps) {
  const { updateSettings } = useSettingsStore();
  const { theme, setTheme } = useTheme();
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [isApplying, setIsApplying] = useState(false);
  const [showApplied, setShowApplied] = useState(false);

  const handleSystemPromptChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setSystemPrompt(e.target.value);
    setShowApplied(false);
  };

  const handleApplySystemPrompt = async () => {
    setIsApplying(true);
    try {
      // Save to settings
      updateSettings({ system: { ...settings, systemPrompt } });

      // Apply to LLM if handler provided
      if (onApplySystemPrompt) {
        await onApplySystemPrompt(systemPrompt);
      }

      setShowApplied(true);
      setTimeout(() => setShowApplied(false), 2000);
    } finally {
      setIsApplying(false);
    }
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

  const handleSelectDirectory = async () => {
    const path = await window.electronAPI.system.selectDirectory();
    if (path) {
      updateSettings({ system: { ...settings, modelDirectory: path } });
    }
  };

  const handleClearDirectory = () => {
    updateSettings({ system: { ...settings, modelDirectory: undefined } });
  };

  const handleHfTokenSave = (token: string | undefined) => {
    updateSettings({ system: { ...settings, huggingFaceToken: token } });
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
        <div className="flex items-center justify-between mb-2">
          <Label htmlFor="system-prompt">System Prompt</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={handleApplySystemPrompt}
            disabled={isApplying || systemPrompt === settings.systemPrompt}
          >
            {showApplied ? (
              <>
                <Check className="h-3 w-3 mr-1" />
                Applied
              </>
            ) : (
              "Apply"
            )}
          </Button>
        </div>
        <Textarea
          id="system-prompt"
          value={systemPrompt}
          onChange={handleSystemPromptChange}
          placeholder="You are a helpful AI assistant..."
          className="mt-2 min-h-[100px]"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Set the AI's behavior and personality. Click Apply to update the
          current session.
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

      <div>
        <Label htmlFor="model-directory">Model Storage Location</Label>
        <div className="flex gap-2 mt-2">
          <Input
            id="model-directory"
            value={settings.modelDirectory || "Default (userData/models)"}
            readOnly
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectDirectory}
            className="shrink-0"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Browse
          </Button>
          {settings.modelDirectory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearDirectory}
              className="shrink-0"
            >
              Reset
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Choose where downloaded models are stored. Default is in your app data
          folder.
        </p>
      </div>

      <HuggingFaceTokenInput
        token={settings.huggingFaceToken}
        onSave={handleHfTokenSave}
      />
    </div>
  );
}
