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
import { HelpSettings } from "./HelpSettings";
import { useSettingsStore } from "@/store/settingsStore";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplySystemPrompt?: (prompt: string) => Promise<void>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  onApplySystemPrompt,
}: SettingsDialogProps) {
  const { settings } = useSettingsStore();
  const [activeTab, setActiveTab] = useState("model");

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
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="privacy">Privacy</TabsTrigger>
            <TabsTrigger value="websearch">Web Search</TabsTrigger>
            <TabsTrigger value="help">Help</TabsTrigger>
          </TabsList>

          <TabsContent value="model" className="space-y-4 mt-4">
            <ModelSettings settings={settings.model} />
          </TabsContent>

          <TabsContent value="system" className="space-y-4 mt-4">
            <SystemSettings
              settings={settings.system}
              onApplySystemPrompt={onApplySystemPrompt}
            />
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4 mt-4">
            <PrivacySettings settings={settings.privacy} />
          </TabsContent>

          <TabsContent value="websearch" className="space-y-4 mt-4">
            <WebSearchSettings settings={settings.webSearch} />
          </TabsContent>

          <TabsContent value="help" className="space-y-4 mt-4">
            <HelpSettings />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
