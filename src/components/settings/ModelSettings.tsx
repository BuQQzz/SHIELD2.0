import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useSettingsStore } from "@/store/settingsStore";
import { ModelSettings as ModelSettingsType } from "@/types/settings";

interface ModelSettingsProps {
  settings: ModelSettingsType;
}

export function ModelSettings({ settings }: ModelSettingsProps) {
  const { updateSettings } = useSettingsStore();

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

  const handleContextLengthChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ model: { ...settings, contextLength: value[0] } });
    }
  };

  const handleMaxTokensChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ model: { ...settings, maxTokens: value[0] } });
    }
  };

  return (
    <div className="space-y-6">
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
          Controls randomness. Lower = focused, Higher = creative
        </p>
      </div>

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
          Nucleus sampling threshold. Lower = more focused
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
          Penalizes repeated tokens. Higher = less repetition
        </p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <Label htmlFor="context-length">Context Length</Label>
          <span className="text-sm text-muted-foreground">
            {settings.contextLength}
          </span>
        </div>
        <Slider
          id="context-length"
          min={512}
          max={16384}
          step={512}
          value={[settings.contextLength]}
          onValueChange={handleContextLengthChange}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Maximum conversation context size
        </p>
        {settings.contextLength > 8192 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            ⚠️ High values require more RAM and slower inference
          </p>
        )}
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
        {settings.maxTokens > 4096 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            ⚠️ Very long responses may be slower and drift off-topic
          </p>
        )}
      </div>
    </div>
  );
}
