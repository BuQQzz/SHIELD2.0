# Component API Reference

## useLlama Hook

React hook for managing llama.cpp integration.

### Returns

```typescript
{
  // State
  isInitialized: boolean; // llama.cpp initialized
  isModelLoaded: boolean; // Model loaded and ready
  currentModel: ModelConfig | null;
  isLoading: boolean; // Loading/initializing
  error: string | null; // Error message if any

  // Methods
  initialize: () => Promise<void>;
  loadModel: (config: ModelConfig) => Promise<void>;
  sendMessage: (content: string, options?: ChatOptions) => Promise<string>;
  sendStreamingMessage: (
    content: string,
    onToken: (token: string) => void,
    options?: ChatOptions
  ) => Promise<void>;
  clearHistory: () => Promise<void>;
}
```

### Types

```typescript
interface ModelConfig {
  name: string;
  uri: string; // Format: "hf:owner/repo:filename"
}

interface ChatOptions {
  temperature?: number; // 0.0-1.0, default 0.7
  maxTokens?: number; // Max response length, default 512
}
```

### Usage Example

```typescript
const { isModelLoaded, loadModel, sendStreamingMessage } = useLlama();

// Load model
await loadModel({
  name: "Qwen2.5-7B-Instruct",
  uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
});

// Stream response
await sendStreamingMessage("Hello!", (token) => console.log(token), {
  temperature: 0.7,
  maxTokens: 512,
});
```

---

## ChatMessage Component

Individual message bubble with streaming support.

### Props

```typescript
interface ChatMessageProps {
  message: {
    role: "user" | "assistant";
    content: string;
  };
  isStreaming?: boolean; // Show pulsing cursor
}
```

### Usage

```typescript
<ChatMessage
  message={{ role: "assistant", content: "Hello!" }}
  isStreaming={false}
/>
```

---

## ChatHeader Component

Top bar showing app title and model status.

### Props

```typescript
interface ChatHeaderProps {
  modelName?: string; // Display model name
  isLoading?: boolean; // Show loading spinner
  error?: string | null; // Display error message
}
```

### Usage

```typescript
<ChatHeader
  modelName="Qwen2.5-7B-Instruct"
  isLoading={false}
  error={null}
/>
```

---

## MessageList Component

Scrollable container for messages with streaming support.

### Props

```typescript
interface MessageListProps {
  messages: Message[];
  streamingContent?: string; // Current streaming message
  isGenerating?: boolean; // Show streaming indicator
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}
```

### Usage

```typescript
<MessageList
  messages={messages}
  streamingContent="Streaming text..."
  isGenerating={true}
/>
```

---

## ChatInput Component

Message input with auto-resize and send/stop controls.

### Props

```typescript
interface ChatInputProps {
  onSend: (message: string) => void;
  isGenerating?: boolean; // Show stop button instead of send
  onStop?: () => void; // Called when user clicks stop
  disabled?: boolean; // Disable input (e.g., while model loads)
}
```

### Usage

```typescript
<ChatInput
  onSend={(msg) => handleSend(msg)}
  isGenerating={isGenerating}
  onStop={() => abortController.abort()}
  disabled={!isModelLoaded}
/>
```

### Features

- Auto-resizing textarea
- Shift+Enter for new lines
- Enter to send
- Disabled state styling
- Send/Stop button toggle

---

## ChatPlaceholder Component

Welcome screen with suggested prompts.

### Props

```typescript
interface ChatPlaceholderProps {
  modelLoaded: boolean; // Show prompts only when ready
  isLoading: boolean; // Show loading spinner
  onPromptClick?: (prompt: string) => void;
}
```

### Usage

```typescript
<ChatPlaceholder
  modelLoaded={isModelLoaded}
  isLoading={isLoading}
  onPromptClick={(prompt) => handleSend(prompt)}
/>
```

### Features

- SHIELD logo and branding
- Loading indicator during model init
- 4 suggested prompts (only when model ready)
- Privacy statement

---

## Sidebar Component

Navigation panel for chat management.

### Props

```typescript
interface SidebarProps {
  onClearHistory?: () => void;
}
```

### Usage

```typescript
<Sidebar
  onClearHistory={() => {
    clearHistory();
    setMessages([]);
  }}
/>
```

### Features

- New Chat button (future: create new session)
- Clear History button
- Search chats (placeholder)
- Settings button (future: model selection)
- Collapsible on mobile

---

## ChatLayout Component

Main layout container with sidebar.

### Props

```typescript
interface ChatLayoutProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}
```

### Usage

```typescript
<ChatLayout sidebar={<Sidebar />}>
  <div className="flex h-full flex-col">
    <ChatHeader />
    <MessageList />
    <ChatInput />
  </div>
</ChatLayout>
```

### Features

- Responsive sidebar toggle
- Proper flex layout
- Mobile-friendly
- Manages sidebar state via Zustand

---

## Complete App.tsx Example

```typescript
import { useState, useEffect, useRef } from "react";
import { useLlama } from "@/hooks/useLlama";

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const streamingContentRef = useRef("");

  const {
    isInitialized,
    isModelLoaded,
    currentModel,
    isLoading,
    error,
    loadModel,
    sendStreamingMessage,
    clearHistory,
  } = useLlama();

  // Auto-load model
  useEffect(() => {
    if (isInitialized && !isModelLoaded && !isLoading) {
      loadModel({
        name: "Qwen2.5-7B-Instruct",
        uri: "hf:Qwen/Qwen2.5-7B-Instruct-GGUF:Q4_K_M",
      });
    }
  }, [isInitialized, isModelLoaded, isLoading, loadModel]);

  const handleSendMessage = async (content: string) => {
    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsGenerating(true);
    setStreamingContent("");
    streamingContentRef.current = "";

    try {
      // Stream response
      await sendStreamingMessage(
        content,
        (token) => {
          streamingContentRef.current += token;
          setStreamingContent(streamingContentRef.current);
        },
        { temperature: 0.7, maxTokens: 512 }
      );

      // Add assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: streamingContentRef.current,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent("");
      streamingContentRef.current = "";
    } catch (err) {
      console.error("Error:", err);
    }

    setIsGenerating(false);
  };

  const handleClearHistory = async () => {
    await clearHistory();
    setMessages([]);
  };

  return (
    <ChatLayout sidebar={<Sidebar onClearHistory={handleClearHistory} />}>
      <div className="flex h-full flex-col">
        <ChatHeader
          modelName={currentModel?.name}
          isLoading={isLoading}
          error={error}
        />
        {messages.length === 0 && !streamingContent ? (
          <ChatPlaceholder
            modelLoaded={isModelLoaded}
            isLoading={isLoading}
            onPromptClick={handleSendMessage}
          />
        ) : (
          <MessageList
            messages={messages}
            streamingContent={streamingContent}
            isGenerating={isGenerating}
          />
        )}
        <ChatInput
          onSend={handleSendMessage}
          isGenerating={isGenerating}
          disabled={!isModelLoaded}
        />
      </div>
    </ChatLayout>
  );
}
```

---

## Styling Guidelines

All components use:

- **Tailwind CSS** for styling
- **shadcn/ui** for base components (Button, etc.)
- **Lucide React** for icons

### Common Classes

- `text-muted-foreground` - Secondary text
- `border-border` - Border color
- `bg-background` - Background color
- `text-primary` - Primary brand color
- `hover:bg-accent` - Hover state

### Responsive Design

- Use `sm:`, `md:`, `lg:` prefixes for breakpoints
- Sidebar collapses on mobile
- Max width constraints for readability

### Accessibility

- All interactive elements keyboard-navigable
- ARIA labels where appropriate
- Semantic HTML structure
- Focus visible states
