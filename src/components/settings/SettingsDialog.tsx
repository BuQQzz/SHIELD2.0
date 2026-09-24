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
import type { ModelOption } from "@/config/models";

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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="config">Configure</TabsTrigger>
            <TabsTrigger value="help">Help</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4 mt-4">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Model</h3>
              <ModelSettings settings={settings.model} />
            </div>
            <div className="space-y-3 pt-3 border-t">
              <h3 className="text-sm font-semibold">System Prompt</h3>
              <SystemSettings
                settings={settings.system}
                onApplySystemPrompt={onApplySystemPrompt}
              />
            </div>
            <div className="space-y-3 pt-3 border-t">
              <h3 className="text-sm font-semibold">Features</h3>
              <div className="space-y-3">
                <WebSearchSettings settings={settings.webSearch} />
                <div className="pt-2">
                  <MCPSettings
                    settings={settings.mcp}
                    currentModel={currentModel}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-3 pt-3 border-t">
              <h3 className="text-sm font-semibold">Privacy</h3>
              <PrivacySettings settings={settings.privacy} />
            </div>
          </TabsContent>

          <TabsContent value="help" className="space-y-4 mt-4">
            <HelpSettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
