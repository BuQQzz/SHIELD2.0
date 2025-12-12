import { Shield, Keyboard, ExternalLink } from "lucide-react";
import { ShortcutItem } from "./HelpComponents";
import { Button } from "@/components/ui/button";

export function HelpSettings() {
  const openDocs = async () => {
    try {
      const result = await window.electronAPI.system.openExternal(
        "https://github.com/BuQQzz/SHIELD2.0/blob/main/README.md"
      );
      if (!result.success) {
        console.error("Failed to open documentation:", result.error);
      }
    } catch (error) {
      console.error("Failed to open documentation:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* App Overview */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">About SHIELD</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          SHIELD is a privacy-first, offline AI chatbot that runs entirely on
          your local machine. All AI inference happens locally using llama.cpp -
          your conversations never leave your PC.
        </p>
        <Button variant="outline" size="sm" onClick={openDocs}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Full Documentation
        </Button>
      </section>

      {/* Quick Start */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Quick Start</h3>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Select an AI model from the header dropdown</li>
          <li>Wait for the model to load</li>
          <li>Type your message and press Enter</li>
          <li>Toggle web search for internet access (optional)</li>
        </ol>
      </section>

      {/* Keyboard Shortcuts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Keyboard Shortcuts</h3>
        </div>
        <div className="space-y-2">
          <ShortcutItem shortcut="Ctrl + N" description="New conversation" />
          <ShortcutItem shortcut="Ctrl + K" description="Focus message input" />
          <ShortcutItem shortcut="Ctrl + ," description="Open settings" />
          <ShortcutItem shortcut="Escape" description="Close / Stop" />
        </div>
      </section>

      {/* Privacy Highlights */}
      <section>
        <h3 className="text-sm font-semibold mb-3">Privacy</h3>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>✓ 100% local AI inference (llama.cpp)</p>
          <p>✓ No telemetry or tracking</p>
          <p>✓ Optional privacy-first web search (DuckDuckGo)</p>
          <p>✓ Encrypted local cache (AES-256-GCM)</p>
          <p>✓ Full data control - delete anytime</p>
        </div>
      </section>

      {/* Version */}
      <section className="pt-4 border-t">
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium">SHIELD</p>
          <p>Version 0.1.0 (Experimental)</p>
        </div>
      </section>
    </div>
  );
}
