import {
  Book,
  Keyboard,
  MessageSquare,
  Sparkles,
  Tag,
  FileJson,
  Moon,
  Shield,
  Cpu,
  HardDrive,
} from "lucide-react";

export function HelpSettings() {
  return (
    <div className="space-y-6">
      {/* App Overview */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">About SHIELD 2.0</h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          SHIELD 2.0 is a privacy-first, offline AI chatbot that runs entirely
          on your local machine. All AI inference happens locally using
          llama.cpp - your conversations never leave your PC and no data is sent
          to external servers.
        </p>
      </section>

      {/* Core Features */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Core Features</h3>
        </div>
        <div className="space-y-4">
          <FeatureItem
            icon={<MessageSquare className="h-4 w-4" />}
            title="Conversation Management"
            description="Create multiple conversations, each with its own history. Conversations are automatically saved and can be resumed anytime."
          />
          <FeatureItem
            icon={<Cpu className="h-4 w-4" />}
            title="Model Selection"
            description="Choose from multiple AI models optimized for different tasks. Switch models mid-conversation if needed."
          />
          <FeatureItem
            icon={<Tag className="h-4 w-4" />}
            title="Conversation Tags"
            description="Organize conversations with custom tags. Add or remove tags from the three-dot menu in the chat header."
          />
          <FeatureItem
            icon={<FileJson className="h-4 w-4" />}
            title="Export & Import"
            description="Export conversations as JSON or Markdown. Import previously exported conversations to continue where you left off."
          />
          <FeatureItem
            icon={<Moon className="h-4 w-4" />}
            title="Dark Mode"
            description="Toggle between light, dark, and system theme. Your preference is saved automatically."
          />
          <FeatureItem
            icon={<HardDrive className="h-4 w-4" />}
            title="Local Storage"
            description="All data is stored locally on your machine. No cloud sync, no external APIs - complete privacy."
          />
        </div>
      </section>

      {/* Keyboard Shortcuts */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Keyboard Shortcuts</h3>
        </div>
        <div className="space-y-2">
          <ShortcutItem shortcut="Ctrl + N" description="New conversation" />
          <ShortcutItem shortcut="Ctrl + K" description="Focus message input" />
          <ShortcutItem shortcut="Ctrl + ," description="Open settings" />
          <ShortcutItem
            shortcut="Escape"
            description="Close settings / Stop generation"
          />
        </div>
      </section>

      {/* Model Settings */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Book className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            Understanding Model Settings
          </h3>
        </div>
        <div className="space-y-3">
          <SettingExplanation
            title="Temperature"
            description="Controls creativity. Lower values (0.1-0.5) make responses more focused and deterministic. Higher values (0.8-1.5) make responses more creative and varied."
          />
          <SettingExplanation
            title="Max Tokens"
            description="Maximum length of AI responses. Higher values allow longer answers but use more memory and take longer to generate."
          />
          <SettingExplanation
            title="Top P (Nucleus Sampling)"
            description="Limits token selection to the most probable options. Lower values make responses more focused, higher values increase variety."
          />
          <SettingExplanation
            title="Top K"
            description="Limits the number of possible next tokens considered. Lower values make output more predictable."
          />
          <SettingExplanation
            title="Repeat Penalty"
            description="Reduces repetition in responses. Higher values make the model less likely to repeat words or phrases."
          />
        </div>
      </section>

      {/* Privacy & Data */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Privacy & Data</h3>
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            ✓ All AI processing happens on your local machine using llama.cpp
          </p>
          <p>✓ No internet connection required for AI inference</p>
          <p>✓ Conversations stored locally in your app data folder</p>
          <p>✓ No telemetry, tracking, or data collection</p>
          <p>✓ No external API calls or cloud services</p>
          <p>
            ✓ You have complete control over your data - delete anytime from
            settings
          </p>
        </div>
      </section>

      {/* Getting Started */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Getting Started</h3>
        </div>
        <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
          <li>Select an AI model from the dropdown in the header</li>
          <li>Wait for the model to load (first time may take a moment)</li>
          <li>Type your message in the input field at the bottom</li>
          <li>Press Enter or click the send button to chat</li>
          <li>
            Use the three-dot menu to manage tags, export, or clear history
          </li>
          <li>Create new conversations anytime with Ctrl+N or the + button</li>
        </ol>
      </section>

      {/* Version Info */}
      <section className="pt-4 border-t">
        <div className="text-center text-sm text-muted-foreground">
          <p className="font-medium">SHIELD 2.0</p>
          <p>Version 0.1.0 (Experimental)</p>
          <p className="mt-2">Built with ❤️ for privacy-conscious users</p>
        </div>
      </section>
    </div>
  );
}

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div>
        <h4 className="text-sm font-medium mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

interface ShortcutItemProps {
  shortcut: string;
  description: string;
}

function ShortcutItem({ shortcut, description }: ShortcutItemProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{description}</span>
      <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
        {shortcut}
      </kbd>
    </div>
  );
}

interface SettingExplanationProps {
  title: string;
  description: string;
}

function SettingExplanation({ title, description }: SettingExplanationProps) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
}
