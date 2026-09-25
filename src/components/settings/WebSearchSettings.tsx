import { Globe, Database, Clock, Shield } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { WebSearchSettings as WebSearchSettingsType } from "@/types/settings";
import { useSettingsStore } from "@/store/settingsStore";

interface WebSearchSettingsProps {
  settings: WebSearchSettingsType;
}

export function WebSearchSettings({ settings }: WebSearchSettingsProps) {
  const { updateSettings } = useSettingsStore();

  const handleToggleEnabled = (enabled: boolean) => {
    updateSettings({ webSearch: { ...settings, enabled } });
  };

  const handleToggleCache = (cacheEnabled: boolean) => {
    updateSettings({ webSearch: { ...settings, cacheEnabled } });
  };

  const handleMaxResultsChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ webSearch: { ...settings, maxResults: value[0] } });
    }
  };

  const handleCacheTTLChange = (value: number[]) => {
    if (value[0] !== undefined) {
      updateSettings({ webSearch: { ...settings, cacheTTL: value[0] } });
    }
  };

  const formatCacheTTL = (minutes: number): string => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
    const days = Math.floor(hours / 24);
    return `${days} ${days === 1 ? "day" : "days"}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Web Search Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Let the model search the web and read pages when an answer needs
          current information
        </p>
      </div>

      {/* Enable Web Search */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <div>
            <Label htmlFor="web-search-enabled">Enable Web Search</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Gives the model two tools, web search and read page. It decides
              when to use them; in Ask mode you approve each one.
            </p>
          </div>
        </div>
        <Switch
          id="web-search-enabled"
          checked={settings.enabled}
          onCheckedChange={handleToggleEnabled}
        />
      </div>

      {settings.enabled && (
        <>
          {/* Max Results */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <Label>Maximum Search Results: {settings.maxResults}</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Number of search results to fetch per query (more results = slower
              but more comprehensive)
            </p>
            <Slider
              value={[settings.maxResults]}
              onValueChange={handleMaxResultsChange}
              min={3}
              max={10}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>3 (Faster)</span>
              <span>10 (More comprehensive)</span>
            </div>
          </div>

          {/* Cache Settings */}
          <div className="space-y-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <div>
                  <Label htmlFor="cache-enabled">Enable Local Caching</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cache search results locally to improve speed and reduce
                    bandwidth
                  </p>
                </div>
              </div>
              <Switch
                id="cache-enabled"
                checked={settings.cacheEnabled}
                onCheckedChange={handleToggleCache}
              />
            </div>

            {settings.cacheEnabled && (
              <div className="space-y-2 ml-6">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label>
                    Cache Duration: {formatCacheTTL(settings.cacheTTL)}
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  How long to keep cached results before refreshing
                </p>
                <Slider
                  value={[settings.cacheTTL]}
                  onValueChange={handleCacheTTLChange}
                  min={60}
                  max={10080}
                  step={60}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>1 hour</span>
                  <span>7 days</span>
                </div>
              </div>
            )}
          </div>

          {/* Privacy Notice */}
          <div className="flex items-start gap-2 p-4 bg-muted/50 rounded-lg">
            <Shield className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">Privacy Protected</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li>All searches go through DuckDuckGo (no tracking)</li>
                <li>
                  The model writes the search words and is told never to include
                  private details from your files
                </li>
                <li>Pages on this PC or your local network are never opened</li>
                <li>All data cached locally on your device</li>
                <li>No search history shared with external services</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
