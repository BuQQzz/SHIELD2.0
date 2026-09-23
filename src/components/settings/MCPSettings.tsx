import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useSettingsStore } from "@/store/settingsStore";
import { useMCP } from "@/hooks/useMCP";
import { useModelCapabilities } from "@/hooks/useModelCapabilities";
import { AlertTriangle } from "lucide-react";
import {
  DEFAULT_SETTINGS,
  type MCPSettings as MCPSettingsType,
} from "@/types/settings";
import type { ModelOption } from "@/components/chat/ModelSelector";

interface MCPSettingsProps {
  settings: MCPSettingsType;
  currentModel?: ModelOption | null;
}

export function MCPSettings({ settings, currentModel }: MCPSettingsProps) {
  const { updateSettings } = useSettingsStore();
  const { isReady, isInitializing, initialize, listTools } = useMCP();
  const { getWarning } = useModelCapabilities(currentModel || null);
  const [availableTools, setAvailableTools] = useState<string[]>([
    "read_file",
    "write_file",
    "list_directory",
  ]);

  const warning = getWarning("mcp");
  const hasWarning = warning !== null;

  const allowedTools =
    settings.allowedTools ?? DEFAULT_SETTINGS.mcp.allowedTools;

  const toolDescriptions = useMemo(
    () => ({
      read_file: "Read file contents",
      write_file: "Create or overwrite files",
      list_directory: "List files and folders",
      read_text_file: "Read text file with head/tail support",
      edit_file: "Edit file contents by text replacement",
      create_directory: "Create folders",
      move_file: "Rename or move files/folders",
      search_files: "Search for files by pattern",
      get_file_info: "Get metadata for files/folders",
      directory_tree: "View recursive folder structure",
      read_multiple_files: "Read multiple files in one operation",
      read_media_file: "Read image/audio file contents",
      list_directory_with_sizes: "List directory contents with file sizes",
      list_allowed_directories: "See allowed filesystem root paths",
    }),
    []
  );

  useEffect(() => {
    const loadTools = async () => {
      if (!isReady && !isInitializing) {
        await initialize();
      }

      const result = await listTools("filesystem");
      if (!result.success || !result.tools || !Array.isArray(result.tools)) {
        return;
      }

      const names = result.tools
        .map((tool) => {
          if (typeof tool === "object" && tool !== null && "name" in tool) {
            return String((tool as { name: unknown }).name);
          }
          return "";
        })
        .filter(Boolean);

      if (names.length > 0) {
        setAvailableTools((previous) =>
          Array.from(new Set([...previous, ...names]))
        );
      }
    };

    void loadTools();
  }, [isReady, isInitializing, initialize, listTools]);

  const handleToggleTool = async (toolName: string, enabled: boolean) => {
    const currentAllowed = settings.allowedTools ?? [];
    let nextAllowed = currentAllowed;

    if (enabled) {
      nextAllowed = Array.from(new Set([...currentAllowed, toolName]));
    } else {
      nextAllowed = currentAllowed.filter((tool) => tool !== toolName);
      if (nextAllowed.length === 0) {
        return;
      }
    }

    await updateSettings({
      mcp: {
        ...settings,
        enabled: true,
        allowedTools: nextAllowed,
      },
    });
  };

  const handleMaxToolCallsChange = async (value: string) => {
    const parsedValue = Number.parseInt(value, 10);
    if (Number.isNaN(parsedValue)) {
      return;
    }

    const clampedValue = Math.max(1, Math.min(10, parsedValue));
    await updateSettings({
      mcp: {
        ...settings,
        maxToolCallsPerTurn: clampedValue,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">MCP Integration</h3>
        <p className="text-sm text-muted-foreground">
          MCP is always enabled. Choose which tools the AI can use.
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

      <div className="space-y-2">
        <Label>Tool Access</Label>
        <div className="space-y-2 rounded-md border p-3">
          {availableTools.map((toolName) => {
            const checked = allowedTools.includes(toolName);
            return (
              <div
                key={toolName}
                className="flex items-center justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{toolName}</p>
                  <p className="text-xs text-muted-foreground">
                    {toolDescriptions[
                      toolName as keyof typeof toolDescriptions
                    ] ?? "Filesystem operation"}
                  </p>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={(enabled) =>
                    handleToggleTool(toolName, enabled)
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="max-tool-calls">Max Tool Calls Per Turn</Label>
        <Input
          id="max-tool-calls"
          type="number"
          min={1}
          max={10}
          step={1}
          value={settings.maxToolCallsPerTurn}
          onChange={(event) => handleMaxToolCallsChange(event.target.value)}
          className="w-32"
        />
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• MCP remains enabled for built-in tool-calling</p>
        <p>• Header status indicator shows: Initializing → Ready</p>
        <p>
          • Only the folder chosen next to the message box is accessible
          (Documents and Desktop if none is chosen)
        </p>
        <p>• All operations require your explicit permission</p>
        <p>• Keep at least one tool enabled for MCP workflows</p>
      </div>
    </div>
  );
}
