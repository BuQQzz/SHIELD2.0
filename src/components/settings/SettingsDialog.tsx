import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelSettings } from "./ModelSettings";
import { SystemSettings } from "./SystemSettings";
import { PrivacySettings } from "./PrivacySettings";
import { WebSearchSettings } from "./WebSearchSettings";
import { MCPSettings } from "./MCPSettings";
import { HelpSettings } from "./HelpSettings";
import { useSettingsStore } from "@/store/settingsStore";
import type { ModelOption } from "@/components/chat/ModelSelector";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplySystemPrompt?: (prompt: string) => Promise<void>;
  currentModel?: ModelOption | null;
}

export function SettingsDialog({
  open,
  onOpenChange,
  onApplySystemPrompt,
  currentModel,
}: SettingsDialogProps) {
  const { settings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState("general");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Customize your AI assistant's behavior and preferences
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="features">Features</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="help">Help</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-4">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Model Settings</h3>
              <ModelSettings settings={settings.model} />
            </div>
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold">System Prompt</h3>
              <SystemSettings
                settings={settings.system}
                onApplySystemPrompt={onApplySystemPrompt}
              />
            </div>
          </TabsContent>

          <TabsContent value="features" className="space-y-6 mt-4">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Web Search</h3>
              <WebSearchSettings settings={settings.webSearch} />
            </div>
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-sm font-semibold">
                Model Context Protocol (MCP)
              </h3>
              <MCPSettings
                settings={settings.mcp}
                currentModel={currentModel}
              />
            </div>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4 mt-4">
            <PrivacySettings settings={settings.privacy} />
          </TabsContent>

          <TabsContent value="help" className="space-y-4 mt-4">
            <HelpSettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
