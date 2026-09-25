import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/store/settingsStore";
import { ModelSettings as ModelSettingsType } from "@/types/settings";
import { ChevronDown, ChevronUp, Play, Zap } from "lucide-react";

interface ModelSettingsProps {
  settings: ModelSettingsType;
}

export function ModelSettings({ settings }: ModelSettingsProps) {
  const { updateSettings } = useSettingsStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleTemperatureChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ model: { ...settings, temperature: value[0] } });
    }
  };

  const handleTopPChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ model: { ...settings, topP: value[0] } });
    }
  };

  const handleTopKChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ model: { ...settings, topK: value[0] } });
    }
  };

  const handleRepeatPenaltyChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ model: { ...settings, repeatPenalty: value[0] } });
    }
  };

  const handleMaxTokensChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ model: { ...settings, maxTokens: value[0] } });
    }
  };

  const handleSpeculativeDecodingChange = (checked: boolean) => {
    updateSettings({ model: { ...settings, speculativeDecoding: checked } });
  };

  const handleLoadOnStartupChange = (checked: boolean) => {
    updateSettings({ model: { ...settings, loadOnStartup: checked } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="load-on-startup">Load last model at startup</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Off: SHIELD starts without a model and loads one when you ask. A
            large model takes the GPU and several GB of system RAM.
          </p>
        </div>
        <Switch
          id="load-on-startup"
          checked={settings.loadOnStartup ?? false}
          onCheckedChange={handleLoadOnStartupChange}
        />
      </div>

      {/* Essential Settings */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label htmlFor="temperature">Temperature</Label>
          <span className="text-sm text-muted-foreground">
            {settings.temperature.toFixed(2)}
          </span>
        </div>
        <Slider
          id="temperature"
          min={0}
          max={2}
          step={0.01}
          value={[settings.temperature]}
          onValueChange={handleTemperatureChange}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Lower = focused, Higher = creative
        </p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label htmlFor="max-tokens">Max Tokens</Label>
          <span className="text-sm text-muted-foreground">
            {settings.maxTokens}
          </span>
        </div>
        <Slider
          id="max-tokens"
          min={256}
          max={8192}
          step={256}
          value={[settings.maxTokens]}
          onValueChange={handleMaxTokensChange}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Maximum response length
        </p>
      </div>

      {/* Advanced Toggle */}
      <div className="pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full justify-between"
        >
          <span className="text-sm">Advanced Settings</span>
          {showAdvanced ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Advanced Settings (Collapsible) */}
      {showAdvanced && (
        <div className="space-y-6 border-t pt-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label htmlFor="top-p">Top P</Label>
              <span className="text-sm text-muted-foreground">
                {settings.topP.toFixed(2)}
              </span>
            </div>
            <Slider
              id="top-p"
              min={0}
              max={1}
              step={0.01}
              value={[settings.topP]}
              onValueChange={handleTopPChange}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Nucleus sampling threshold
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label htmlFor="top-k">Top K</Label>
              <span className="text-sm text-muted-foreground">
                {settings.topK}
              </span>
            </div>
            <Slider
              id="top-k"
              min={1}
              max={100}
              step={1}
              value={[settings.topK]}
              onValueChange={handleTopKChange}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Limits vocabulary to top K tokens
            </p>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label htmlFor="repeat-penalty">Repeat Penalty</Label>
              <span className="text-sm text-muted-foreground">
                {settings.repeatPenalty.toFixed(2)}
              </span>
            </div>
            <Slider
              id="repeat-penalty"
              min={1}
              max={2}
              step={0.01}
              value={[settings.repeatPenalty]}
              onValueChange={handleRepeatPenaltyChange}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Higher = less repetition
            </p>
          </div>

          <div>
            <Label>Context Length</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Set per model in the Model Library. By default each model gets the
              largest window that keeps it fast on your GPU.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <Label htmlFor="speculative-decoding">
                  Speculative Decoding
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Speeds up generation for code & text tasks
              </p>
            </div>
            <Switch
              id="speculative-decoding"
              checked={settings.speculativeDecoding ?? true}
              onCheckedChange={handleSpeculativeDecodingChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
