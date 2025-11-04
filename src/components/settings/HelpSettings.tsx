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
  Globe,
  Lock,
  Database,
  Eye,
  EyeOff,
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

      {/* Privacy-First Web Search - UNIQUE FEATURE */}
      <section className="border-2 border-primary/20 rounded-lg p-4 bg-primary/5">
        <div className="flex items-center gap-2 mb-3">
          <Globe className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">
            🌟 Privacy-First Web Search
          </h3>
          <span className="ml-auto text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full font-medium">
            UNIQUE FEATURE
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Browse the web anonymously and safely with the LLM. SHIELD 2.0
          features a privacy-focused web search and caching system that allows
          your AI assistant to access information from the internet while
          protecting your privacy.
        </p>
        <div className="space-y-4">
          <FeatureItem
            icon={<Lock className="h-4 w-4" />}
            title="Anonymous Search"
            description="Search DuckDuckGo without tracking. User agent rotation, no cookies, no referrer headers, and DNT (Do Not Track) enabled. Your searches are completely private."
          />
          <FeatureItem
            icon={<EyeOff className="h-4 w-4" />}
            title="Tracker Blocking"
            description="Automatically blocks 20+ tracking domains including Google Analytics, Facebook trackers, DoubleClick, Mixpanel, and more. Browse without being watched."
          />
          <FeatureItem
            icon={<Database className="h-4 w-4" />}
            title="Encrypted Local Cache"
            description="Fetched content is encrypted with AES-256-GCM and stored locally. Access previously searched content instantly without re-fetching. Cache is fully under your control."
          />
          <FeatureItem
            icon={<Globe className="h-4 w-4" />}
            title="Clean Content Extraction"
            description="Uses Mozilla Readability to extract clean, readable content from web pages. No ads, no trackers, just the content you need."
          />
          <FeatureItem
            icon={<Eye className="h-4 w-4" />}
            title="Full Transparency"
            description="View cache statistics, manage stored content, and clear cache anytime. Export cached data or delete specific entries. You're always in control."
          />
        </div>

        {/* Privacy Features Breakdown */}
        <div className="mt-4 pt-4 border-t border-primary/20">
          <h4 className="text-sm font-semibold mb-3">Privacy Protections</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>No search history sent to servers</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Request anonymization</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Tracking parameter removal</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Analytics script blocking</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>AES-256 encrypted cache</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Local-only data storage</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>No API keys required</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              <span>Configurable cache expiry</span>
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div className="mt-4 pt-4 border-t border-primary/20">
          <h4 className="text-sm font-semibold mb-3">How It Works</h4>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>
              Enable web search in settings and configure privacy options
            </li>
            <li>
              Toggle web search in the chat interface when you need information
            </li>
            <li>
              AI searches DuckDuckGo anonymously with tracker blocking enabled
            </li>
            <li>
              Content is fetched, cleaned, and encrypted before caching locally
            </li>
            <li>
              Cached content is available instantly for future requests
            </li>
            <li>
              Manage your cache, export data, or clear it anytime from settings
            </li>
          </ol>
        </div>

        {/* Technical Details */}
        <div className="mt-4 pt-4 border-t border-primary/20">
          <h4 className="text-sm font-semibold mb-2">Technical Details</h4>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              <span className="font-medium">Search Provider:</span> DuckDuckGo
              (privacy-focused, no tracking)
            </p>
            <p>
              <span className="font-medium">Encryption:</span> AES-256-GCM with
              secure key storage
            </p>
            <p>
              <span className="font-medium">Content Extraction:</span> Mozilla
              Readability (same tech as Firefox Reader View)
            </p>
            <p>
              <span className="font-medium">Default Cache Limit:</span> 500MB
              (configurable)
            </p>
            <p>
              <span className="font-medium">Default TTL:</span> 7 days
              (configurable)
            </p>
            <p>
              <span className="font-medium">Blocked Trackers:</span> Google
              Analytics, Facebook Pixel, DoubleClick, Mixpanel, Hotjar, Segment,
              and 15+ more
            </p>
          </div>
        </div>
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
          <p>
            ✓ Web search is optional and privacy-focused (DuckDuckGo, tracker
            blocking, encrypted cache)
          </p>
          <p>✓ Conversations stored locally in your app data folder</p>
          <p>✓ No telemetry, tracking, or data collection</p>
          <p>✓ No external API calls or cloud services (except optional web search)</p>
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
            (Optional) Enable web search in settings for internet access
          </li>
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
